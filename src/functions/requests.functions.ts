import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { eq, inArray } from "drizzle-orm";

import {
  ApproveRequestSchema,
  CreateRequestSchema,
  DenyRequestSchema,
  ListRequestsSchema,
  RemoveFromChaptarrSchema,
  RequestIdSchema,
} from "#/lib/schemas/requests";
import { formatList } from "#/lib/format";
import { isLanguageAccepted, languageName } from "#/lib/languages";
import { isChaptarrType, type SearchableType } from "#/lib/media-types";
import { DEFAULT_REQUEST_POLICY } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";
import { requireAdmin, requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { media, request, type RequestTarget } from "#/server/db/schema";
import { runJob } from "#/server/jobs";
import {
  isAutoApproved,
  listRequests,
  requestHistory,
  upsertMedia,
  getRequestRow,
} from "#/server/requests/queries";
import { downloadsFor } from "#/server/requests/downloads";
import { getLanguagePolicy } from "#/server/requests/language-policy";
import { submitRequest } from "#/server/requests/submit";
import {
  createRequest,
  InvalidTransitionError,
  targetKey,
  transitionRequest as transitionUnchecked,
} from "#/server/requests/transitions";
import { services } from "#/server/services";
import { removeBook } from "#/server/services/chaptarr/client";
import { settings } from "#/server/settings";
import { formatDefaults, podcastDefaults, requestPolicy } from "#/server/settings/definitions";
import { chaptarrProviderId, mediaSources } from "#/server/sources";

/** Submission can take a while (Chaptarr refreshes the author): never block the caller on it. */
function submitInBackground(requestId: string) {
  void submitRequest({ db, services, settings }, requestId).catch((error: unknown) => {
    console.error(`[requests] submitting ${requestId} failed`, error);
  });
}

/** Status changes from the UI: a stale page asking for an impossible change gets a readable error. */
function transitionRequest(...args: Parameters<typeof transitionUnchecked>) {
  try {
    return transitionUnchecked(...args);
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      setResponseStatus(409);
      throw new Error(m.request_invalid_transition(), { cause: error });
    }
    throw error;
  }
}

function notFound(): never {
  setResponseStatus(404);
  throw new Error(m.request_not_found());
}

/** Where a request goes: the admin's choice, else the format's defaults. */
async function resolveTarget(
  format: SearchableType,
  override: { rootFolderPath?: string; libraryId?: string; folderId?: string },
): Promise<RequestTarget> {
  if (format === "podcast") {
    const defaults = await settings.get(podcastDefaults);
    const libraryId = override.libraryId ?? defaults?.libraryId;
    const folderId = override.folderId ?? (override.libraryId ? undefined : defaults?.folderId);
    if (!libraryId || !folderId) throw new Error(m.request_error_podcast_defaults_missing());
    return { service: "audiobookshelf", libraryId, folderId };
  }
  const defaults = await settings.get(formatDefaults[format]);
  const rootFolderPath = override.rootFolderPath ?? defaults?.rootFolderPath;
  if (!rootFolderPath) {
    throw new Error(
      format === "ebook"
        ? m.request_error_ebook_defaults_missing()
        : m.request_error_defaults_missing(),
    );
  }
  return { service: "chaptarr", rootFolderPath };
}

/** Admins always; others per their flag, except podcasts while the policy asks for approval. */
async function isRequestAutoApproved(userId: string, isAdmin: boolean, format: SearchableType) {
  if (isAdmin) return true;
  if (format === "podcast") {
    const policy = (await settings.get(requestPolicy)) ?? DEFAULT_REQUEST_POLICY;
    if (policy.podcastsRequireApproval) return false;
  }
  return isAutoApproved(db, userId, false);
}

/**
 * Requests an audiobook, an eBook or a podcast. Admins may pick the target
 * (Chaptarr folder and profile, or Audiobookshelf library and folder);
 * everyone else gets the format's defaults. Signed-in users.
 */
export const requestMedia = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(CreateRequestSchema)
  .handler(async ({ data, context }) => {
    const { user } = context.session;
    const isAdmin = user.role === "admin";
    const format = data.media.type;
    const target = await resolveTarget(format, isAdmin ? data : {});

    const details = await mediaSources[format].getDetails(services, data.media.id);
    if (!details.ok) throw new Error(details.error.message);
    // Chaptarr would wait forever for a work its metadata profile filters out: refuse it here.
    const policy = isChaptarrType(format)
      ? await getLanguagePolicy({ services, settings }, format)
      : null;
    if (isLanguageAccepted(policy, details.value.languages) === false && policy) {
      setResponseStatus(422);
      throw new Error(
        m.request_language_not_accepted({
          languages: formatList(policy.allowed.map(languageName)),
        }),
      );
    }

    const mediaId = upsertMedia(db, details.value);
    const result = createRequest(db, {
      mediaId,
      userId: user.id,
      format,
      target,
      qualityProfileId: isAdmin && format !== "podcast" ? (data.qualityProfileId ?? null) : null,
      autoApprove: await isRequestAutoApproved(user.id, isAdmin, format),
    });
    if (result.kind === "created" && result.status === "approved") {
      submitInBackground(result.requestId);
    }
    return result;
  });

/** The caller's requests (and those they watch), or every request for admins. */
export const getRequests = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(ListRequestsSchema)
  .handler(async ({ data, context }) => {
    const isAdmin = context.session.user.role === "admin";
    if (data.scope === "all" && !isAdmin) {
      setResponseStatus(403);
      throw new Error("Forbidden");
    }
    const rows = listRequests(db, {
      userId: data.scope === "mine" ? context.session.user.id : undefined,
      filter: data.filter,
    });
    // "Downloading" only when Chaptarr's queue says so; otherwise a sent request is just requested.
    const sentIds = rows
      .filter((r) => r.status === "submitted" && !r.waitingForChaptarr)
      .map((r) => r.id);
    const sent =
      sentIds.length > 0
        ? db
            .select({ id: request.id, format: request.format, backendRef: request.backendRef })
            .from(request)
            .where(inArray(request.id, sentIds))
            .all()
        : [];
    const downloads = await downloadsFor(services, sent);
    return rows.map((row) => ({ ...row, download: downloads.get(row.id) ?? null }));
  });

/** A request's status history. Its requester, a watcher or an admin. */
export const getRequestHistory = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(RequestIdSchema)
  .handler(({ data, context }) => {
    const row = getRequestRow(db, data.id);
    if (!row) return notFound();
    const { user } = context.session;
    const mine = listRequests(db, { userId: user.id, filter: "all" }).some((r) => r.id === data.id);
    if (user.role !== "admin" && !mine) return notFound();
    return requestHistory(db, data.id);
  });

/** Approves a pending request, optionally changing its folder / profile first. Admins. */
export const approveRequest = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(ApproveRequestSchema)
  .handler(({ data, context }) => {
    const row = getRequestRow(db, data.id);
    if (!row) return notFound();
    const changesTarget =
      data.rootFolderPath || data.qualityProfileId !== undefined || data.libraryId || data.folderId;
    if (row.status === "pending" && changesTarget) {
      let target: RequestTarget = row.target;
      if (row.target.service === "chaptarr" && data.rootFolderPath) {
        target = { ...row.target, rootFolderPath: data.rootFolderPath };
      } else if (row.target.service === "audiobookshelf" && data.libraryId && data.folderId) {
        target = { service: "audiobookshelf", libraryId: data.libraryId, folderId: data.folderId };
      }
      db.update(request)
        .set({
          target,
          targetKey: targetKey(target),
          qualityProfileId: data.qualityProfileId ?? row.qualityProfileId,
        })
        .where(eq(request.id, data.id))
        .run();
    }
    const status = transitionRequest(db, data.id, {
      to: "approved",
      actor: context.session.user.id,
    });
    submitInBackground(data.id);
    return { status };
  });

export const denyRequest = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(DenyRequestSchema)
  .handler(({ data, context }) => {
    if (!getRequestRow(db, data.id)) return notFound();
    const status = transitionRequest(db, data.id, {
      to: "denied",
      actor: context.session.user.id,
      message: data.reason || null,
    });
    return { status };
  });

/** Cancels a pending request: its requester, or an admin (who can also give up on failed ones). */
export const cancelRequest = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(RequestIdSchema)
  .handler(({ data, context }) => {
    const row = getRequestRow(db, data.id);
    const { user } = context.session;
    const isAdmin = user.role === "admin";
    if (!row || (!isAdmin && row.userId !== user.id)) return notFound();
    if (!isAdmin && row.status !== "pending") throw new Error(m.request_cannot_cancel());
    return { status: transitionRequest(db, data.id, { to: "cancelled", actor: user.id }) };
  });

/** Sends a failed request again. Admins. */
export const retryRequest = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(RequestIdSchema)
  .handler(({ data, context }) => {
    if (!getRequestRow(db, data.id)) return notFound();
    const status = transitionRequest(db, data.id, {
      to: "approved",
      actor: context.session.user.id,
    });
    submitInBackground(data.id);
    return { status };
  });

/** Runs the library sync and availability check now. Admins. */
export const checkAvailabilityNow = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    await runJob("library-sync");
    return { ok: true };
  });

/** Deletes a request and its history from Storyrr (not from Chaptarr). Admins. */
export const deleteRequest = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(RequestIdSchema)
  .handler(({ data }) => {
    const deleted = db
      .delete(request)
      .where(eq(request.id, data.id))
      .returning({ id: request.id })
      .all();
    if (deleted.length === 0) return notFound();
    return { ok: true };
  });

/**
 * Removes the requested book from Chaptarr (its rows for that format, or the
 * pending import queued only for it), optionally with its files. A request
 * still on its way is then cancelled. Admins.
 */
export const removeFromChaptarr = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(RemoveFromChaptarrSchema)
  .handler(async ({ data, context }) => {
    const row = db
      .select({
        status: request.status,
        format: request.format,
        source: media.source,
        externalId: media.externalId,
      })
      .from(request)
      .innerJoin(media, eq(media.id, request.mediaId))
      .where(eq(request.id, data.id))
      .get();
    if (!row) return notFound();
    const providerId = chaptarrProviderId(row.source, row.externalId);
    if (!providerId || row.format === "podcast") throw new Error(m.request_error_unsupported());
    const chaptarr = await services.chaptarr();
    if (!chaptarr)
      throw new Error(m.request_error_not_configured({ service: m.service_chaptarr() }));

    const result = await removeBook(chaptarr, {
      providerId,
      media: row.format,
      deleteFiles: data.deleteFiles,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    if (row.status === "submitted" || row.status === "approved") {
      transitionRequest(db, data.id, { to: "cancelled", actor: context.session.user.id });
    }
    return { ok: true as const, ...result.value };
  });
