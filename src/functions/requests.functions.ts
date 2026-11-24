import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { desc, eq, inArray } from "drizzle-orm";
import type * as v from "valibot";

import {
  ApproveRequestSchema,
  CreateRequestSchema,
  RequestManySchema,
  DenyRequestSchema,
  ListRequestsSchema,
  BlockIdSchema,
  BlockMediaSchema,
  RemoveFromChaptarrSchema,
  RequestIdSchema,
} from "#/lib/schemas/requests";
import { FormatInputSchema as FormatQuotaSchema } from "#/lib/schemas/settings";
import { formatList } from "#/lib/format";
import { hasPermission, type Permission } from "#/lib/permissions";
import { isLanguageAccepted, languageName } from "#/lib/languages";
import { m } from "#/paraglide/messages.js";
import { requirePermission, requireUser } from "#/server/auth/middleware";

const requireManageRequests = requirePermission("manage_requests");
import { db } from "#/server/db";
import { media, request } from "#/server/db/schema";
import { runJob } from "#/server/jobs";
import {
  activeRequestsByExternalId,
  countPending,
  listRequests,
  requestHistory,
  upsertMedia,
  getRequestRow,
} from "#/server/requests/queries";
import { block, findBlock, listBlocklist, unblock } from "#/server/requests/blocklist";
import { downloadsFor } from "#/server/requests/downloads";
import { getLanguagePolicy } from "#/server/requests/language-policy";
import { requestQuota } from "#/server/requests/quota";
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
import { formatDefaults } from "#/server/settings/definitions";
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

type RequestCaller = {
  session: { user: { id: string; role?: string | null } };
  permissions: readonly Permission[];
};

/**
 * Requests one title for the caller, with every check (permission, blocklist,
 * language, limits). Throws with the reason, the HTTP status set.
 */
async function requestTitle(
  context: RequestCaller,
  data: v.InferOutput<typeof CreateRequestSchema>,
) {
  const { user } = context.session;
  const { permissions } = context;
  const isAdmin = user.role === "admin";
  const format = data.media.type;
  if (!hasPermission(permissions, `request_${format}`)) {
    setResponseStatus(403);
    throw new Error(m.request_not_allowed());
  }
  // Picking the folder and profile is an advanced request option.
  const advanced = hasPermission(permissions, "request_advanced");
  const defaults = await settings.get(formatDefaults[format]);
  const rootFolderPath = (advanced ? data.rootFolderPath : undefined) ?? defaults?.rootFolderPath;
  if (!rootFolderPath) {
    throw new Error(
      format === "ebook"
        ? m.request_error_ebook_defaults_missing()
        : m.request_error_defaults_missing(),
    );
  }

  const details = await mediaSources[format].getDetails(services, data.media.id);
  if (!details.ok) throw new Error(details.error.message);
  if (findBlock(db, details.value.source, details.value.externalId)) {
    setResponseStatus(409);
    throw new Error(m.request_blocked());
  }
  // Chaptarr would wait forever for a work its metadata profile filters out: refuse it here.
  const policy = await getLanguagePolicy({ services, settings }, format);
  if (isLanguageAccepted(policy, details.value.languages) === false && policy) {
    setResponseStatus(422);
    throw new Error(
      m.request_language_not_accepted({
        languages: formatList(policy.allowed.map(languageName)),
      }),
    );
  }

  // Joining someone else's active request costs nothing; a new one counts against the limit.
  const joins = activeRequestsByExternalId(db, {
    source: details.value.source,
    format,
    externalIds: [details.value.externalId],
  }).has(details.value.externalId);
  if (!joins) {
    const quota = await requestQuota({ db, settings }, { id: user.id, isAdmin }, format);
    if (quota.remaining === 0 && quota.limit !== null) {
      setResponseStatus(429);
      throw new Error(m.request_quota_exceeded({ limit: quota.limit, days: quota.days }));
    }
  }

  const mediaId = upsertMedia(db, details.value);
  const result = createRequest(db, {
    mediaId,
    userId: user.id,
    format,
    target: { service: "chaptarr", rootFolderPath },
    qualityProfileId: advanced ? (data.qualityProfileId ?? null) : null,
    autoApprove: hasPermission(permissions, `auto_approve_${format}`),
  });
  if (result.kind === "created" && result.status === "approved") {
    submitInBackground(result.requestId);
  }
  return result;
}

/**
 * Requests an audiobook or an eBook. Users with Advanced requests may pick the
 * target folder and quality profile; others get the format's defaults.
 */
export const requestMedia = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(CreateRequestSchema)
  .handler(({ data, context }) => requestTitle(context, data));

/**
 * Requests several titles at once (a series' volumes), each with the same
 * checks as one request; reports what each one did instead of stopping at the
 * first failure.
 */
export const requestMany = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(RequestManySchema)
  .handler(async ({ data, context }) => {
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of data.ids) {
      try {
        await requestTitle(context, { media: { type: data.type, id } });
        results.push({ id, ok: true });
      } catch (error) {
        results.push({
          id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    // A failed item set the status; the batch itself succeeded.
    setResponseStatus(200);
    return results;
  });

/** The caller's requests (and those they watch), or every request for admins. */
export const getRequests = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(ListRequestsSchema)
  .handler(async ({ data, context }) => {
    const self = context.session.user.id;
    const others = data.scope === "all" || (data.userId !== undefined && data.userId !== self);
    if (others && !hasPermission(context.permissions, "view_requests")) {
      setResponseStatus(403);
      throw new Error("Forbidden");
    }
    const rows = listRequests(db, {
      userId: data.userId ?? (data.scope === "mine" ? self : undefined),
      filter: data.filter,
      format: data.format,
      sort: data.sort,
      order: data.order,
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

/** A request's status history. Its requester, a watcher, or who can view all requests. */
export const getRequestHistory = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(RequestIdSchema)
  .handler(({ data, context }) => {
    const row = getRequestRow(db, data.id);
    if (!row) return notFound();
    const { user } = context.session;
    const mine = listRequests(db, { userId: user.id, filter: "all" }).some((r) => r.id === data.id);
    if (!hasPermission(context.permissions, "view_requests") && !mine) return notFound();
    return requestHistory(db, data.id);
  });

/** Approves a pending request, optionally changing its folder / profile first. Request managers. */
export const approveRequest = createServerFn({ method: "POST" })
  .middleware([requireManageRequests])
  .validator(ApproveRequestSchema)
  .handler(({ data, context }) => {
    const row = getRequestRow(db, data.id);
    if (!row) return notFound();
    if (row.status === "pending" && (data.rootFolderPath || data.qualityProfileId !== undefined)) {
      const target =
        data.rootFolderPath && row.target.service === "chaptarr"
          ? { ...row.target, rootFolderPath: data.rootFolderPath }
          : row.target;
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
  .middleware([requireManageRequests])
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
    const manager = hasPermission(context.permissions, "manage_requests");
    if (!row || (!manager && row.userId !== user.id)) return notFound();
    if (!manager && row.status !== "pending") throw new Error(m.request_cannot_cancel());
    return { status: transitionRequest(db, data.id, { to: "cancelled", actor: user.id }) };
  });

/** Sends a failed request again. Admins. */
export const retryRequest = createServerFn({ method: "POST" })
  .middleware([requireManageRequests])
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
  .middleware([requireManageRequests])
  .handler(async () => {
    await runJob("library-sync");
    return { ok: true };
  });

/** Deletes a request and its history from Storyrr (not from Chaptarr). Admins. */
export const deleteRequest = createServerFn({ method: "POST" })
  .middleware([requireManageRequests])
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
  .middleware([requireManageRequests])
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
    if (!providerId) throw new Error(m.request_error_unsupported());
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

/**
 * Discover's request rows: the latest requests (everyone's for admins, one's
 * own and watched ones otherwise) and what became available lately (library
 * content, the same for everyone). Signed-in users.
 */
export const getDiscoverRequests = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(({ context }) => {
    const { user } = context.session;
    const recentRequests = listRequests(db, {
      userId: hasPermission(context.permissions, "view_requests") ? undefined : user.id,
      filter: "all",
    })
      .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20);
    const added = db
      .select({
        type: media.type,
        externalId: media.externalId,
        title: media.title,
        authors: media.authors,
        coverUrl: media.coverUrl,
        updatedAt: request.updatedAt,
      })
      .from(request)
      .innerJoin(media, eq(media.id, request.mediaId))
      .where(eq(request.status, "available"))
      .orderBy(desc(request.updatedAt))
      .limit(40)
      .all();
    // One card per work, even if several requests delivered it.
    const recentlyAdded = [
      ...new Map(added.map((item) => [`${item.type}:${item.externalId}`, item])).values(),
    ].slice(0, 20);
    return { recentRequests, recentlyAdded };
  });

/** Blocks a work so nobody can request it (existing requests are left alone). Admins. */
export const blockMedia = createServerFn({ method: "POST" })
  .middleware([requirePermission("manage_blocklist")])
  .validator(BlockMediaSchema)
  .handler(async ({ data, context }) => {
    const details = await mediaSources[data.media.type].getDetails(services, data.media.id);
    if (!details.ok) throw new Error(details.error.message);
    const id = block(db, details.value, {
      reason: data.reason || null,
      userId: context.session.user.id,
    });
    return { id };
  });

export const unblockMedia = createServerFn({ method: "POST" })
  .middleware([requirePermission("manage_blocklist")])
  .validator(BlockIdSchema)
  .handler(({ data }) => {
    if (!unblock(db, data.id)) return notFound();
    return { ok: true };
  });

export const getBlocklist = createServerFn({ method: "GET" })
  .middleware([requirePermission("manage_blocklist")])
  .handler(() => listBlocklist(db));

/** How many requests of a format the caller may still make (shown in the request dialog). */
export const getMyQuota = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(FormatQuotaSchema)
  .handler(({ data, context }) =>
    requestQuota(
      { db, settings },
      { id: context.session.user.id, isAdmin: context.session.user.role === "admin" },
      data.format,
    ),
  );

/** How many requests wait for approval (sidebar badge). Request managers. */
export const getPendingCount = createServerFn({ method: "GET" })
  .middleware([requireManageRequests])
  .handler(() => ({ count: countPending(db) }));
