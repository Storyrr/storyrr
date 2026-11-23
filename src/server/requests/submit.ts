import "@tanstack/react-start/server-only";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { isLanguageAccepted } from "#/lib/languages";
import { isSearchableType } from "#/lib/media-types";
import { encodeRequestError, type RequestError } from "#/lib/request-errors";
import type { RequestStatus } from "#/lib/requests";
import type { AppDatabase } from "#/server/db/client";
import { media, request } from "#/server/db/schema";
import { formatDefaults } from "#/server/settings/definitions";
import { chaptarrProviderId, mediaSources } from "#/server/sources";
import type { SettingsStore } from "#/server/settings/store";
import type { Services } from "#/server/services/factory";
import { submitBook } from "#/server/services/chaptarr/client";

import { getLanguagePolicy } from "./language-policy";
import { upsertMedia } from "./queries";
import { transitionRequest } from "./transitions";

export type SubmitDeps = {
  db: AppDatabase;
  services: Services;
  settings: SettingsStore;
};

// One process: this set is enough to keep the job and an approval from
// submitting the same request twice at the same time.
const inFlight = new Set<string>();

/**
 * Hands an approved request to its backend and records the outcome
 * (`submitted` with backend ids, or `failed` with the reason).
 */
export async function submitRequest(
  deps: SubmitDeps,
  requestId: string,
): Promise<RequestStatus | "skipped"> {
  if (inFlight.has(requestId)) return "skipped";
  inFlight.add(requestId);
  try {
    return await submit(deps, requestId);
  } finally {
    inFlight.delete(requestId);
  }
}

/** The request's new status, or "skipped" when it wasn't (or no longer) approved. */
async function submit(
  { db, services, settings }: SubmitDeps,
  requestId: string,
): Promise<RequestStatus | "skipped"> {
  const row = db
    .select({ request, media })
    .from(request)
    .innerJoin(media, eq(media.id, request.mediaId))
    .where(eq(request.id, requestId))
    .get();
  if (!row || row.request.status !== "approved") return "skipped";

  const failWith = (error: RequestError) =>
    transitionRequest(db, requestId, {
      to: "failed",
      actor: "system",
      message: encodeRequestError(error),
    });

  const { target, format, qualityProfileId } = row.request;
  if (target.service !== "chaptarr" || format === "podcast")
    return failWith({ code: "unsupported" });

  const chaptarr = await services.chaptarr();
  if (!chaptarr) return failWith({ code: "not_configured", service: "chaptarr" });
  // Same check as when requesting: Chaptarr would wait forever for a work its profile filters out.
  const refused = await refusedLanguages({ services, settings }, format, row.media.metadata);
  if (refused) return failWith({ code: "language_not_accepted", languages: refused });

  const providerId = chaptarrProviderId(row.media.source, row.media.externalId);
  if (!providerId) return failWith({ code: "unsupported" });
  const defaults = await settings.get(formatDefaults[format]);
  if (!defaults) return failWith({ code: "defaults_missing", format });

  const result = await submitBook(chaptarr, {
    providerId,
    media: format,
    rootFolderPath: target.rootFolderPath,
    qualityProfileId: qualityProfileId ?? defaults.qualityProfileId,
    metadataProfileId: defaults.metadataProfileId,
  });
  if (!result.ok) return failWith({ code: "service", service: "chaptarr", ...result.error });

  return transitionRequest(db, requestId, {
    to: "submitted",
    actor: "system",
    backendRef:
      result.value.state === "added"
        ? { chaptarrBookId: result.value.bookId, chaptarrForeignBookId: result.value.foreignBookId }
        : {
            ...(result.value.pendingId === undefined
              ? {}
              : { chaptarrPendingId: result.value.pendingId }),
            chaptarrForeignBookId: result.value.foreignBookId,
          },
  });
}

/** Submits every approved request (job safety net for approvals whose submission didn't run). */
export async function submitApproved(deps: SubmitDeps): Promise<number> {
  const approved = deps.db
    .select({ id: request.id })
    .from(request)
    .where(eq(request.status, "approved"))
    .all();
  for (const { id } of approved) await submitRequest(deps, id);
  return approved.length;
}

const StoredLanguagesSchema = v.object({ languages: v.array(v.nullable(v.string())) });

/**
 * The languages Chaptarr accepts, if it would refuse this work (all of its
 * languages filtered out by the format's metadata profile); null otherwise or
 * when it can't tell.
 */
async function refusedLanguages(
  deps: Pick<SubmitDeps, "services" | "settings">,
  format: string,
  metadata: unknown,
): Promise<string[] | null> {
  if (!isSearchableType(format)) return null;
  const stored = v.safeParse(StoredLanguagesSchema, metadata);
  if (!stored.success) return null;
  const policy = await getLanguagePolicy(deps, format);
  return policy && isLanguageAccepted(policy, stored.output.languages) === false
    ? policy.allowed
    : null;
}

/**
 * Fails submitted requests Chaptarr only queued (no book yet) when their
 * language will never pass its metadata profile: Chaptarr would retry them
 * forever. Run by the library sync job.
 */
export async function failStuckRequests(deps: SubmitDeps): Promise<string[]> {
  const rows = deps.db
    .select({
      id: request.id,
      format: request.format,
      backendRef: request.backendRef,
      metadata: media.metadata,
      source: media.source,
      externalId: media.externalId,
    })
    .from(request)
    .innerJoin(media, eq(media.id, request.mediaId))
    .where(and(eq(request.status, "submitted")))
    .all();
  const failed: string[] = [];
  for (const row of rows) {
    if (row.backendRef?.chaptarrBookId !== undefined) continue;
    const refused = await refusedLanguages(deps, row.format, await withLanguages(deps, row));
    if (!refused) continue;
    transitionRequest(deps.db, row.id, {
      to: "failed",
      actor: "system",
      message: encodeRequestError({ code: "language_not_accepted", languages: refused }),
    });
    failed.push(row.id);
  }
  return failed;
}

/**
 * The stored metadata, refreshed from the provider when it predates language
 * tracking (requests made before Storyrr stored languages).
 */
async function withLanguages(
  { db, services }: Pick<SubmitDeps, "db" | "services">,
  row: { format: string; source: string; externalId: string; metadata: unknown },
): Promise<unknown> {
  if (v.is(StoredLanguagesSchema, row.metadata) || !isSearchableType(row.format))
    return row.metadata;
  const source = mediaSources[row.format];
  if (source.source !== row.source) return row.metadata;
  const details = await source.getDetails(services, row.externalId);
  if (!details.ok) return row.metadata;
  upsertMedia(db, details.value);
  return { ...details.value };
}
