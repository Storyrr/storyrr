import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";

import { encodeRequestError, type RequestError } from "#/lib/request-errors";
import type { RequestStatus } from "#/lib/requests";
import type { AppDatabase } from "#/server/db/client";
import { media, request } from "#/server/db/schema";
import { audiobookDefaults } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";
import type { Services } from "#/server/services/factory";
import { submitBook } from "#/server/services/chaptarr/client";

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
  const defaults = await settings.get(audiobookDefaults);
  if (!defaults) return failWith({ code: "defaults_missing" });

  const result = await submitBook(chaptarr, {
    asin: row.media.externalId,
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
            chaptarrPendingId: result.value.pendingId,
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
