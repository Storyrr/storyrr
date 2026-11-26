import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { setResponseStatus } from "@tanstack/react-start/server";
import { desc, eq, inArray } from "drizzle-orm";

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
import { hasPermission, type Permission } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";
import { requirePermission, requireUser } from "#/server/auth/middleware";

const requireManageRequests = requirePermission("manage_requests");
import { db } from "#/server/db";
import { media, request } from "#/server/db/schema";
import { SEARCHABLE_TYPES } from "#/lib/media-types";
import type { RequestStatus } from "#/lib/requests";
import { runJob } from "#/server/jobs";
import {
  activeRequestsByExternalId,
  countPending,
  listRequests,
  requestHistory,
  getRequestRow,
} from "#/server/requests/queries";
import { block, listBlocklist, unblock } from "#/server/requests/blocklist";
import { downloadsFor } from "#/server/requests/downloads";
import { requestQuota } from "#/server/requests/quota";
import {
  RequestRefusedError,
  requestTitle as requestTitleUnchecked,
} from "#/server/requests/request-title";
import { submitRequest } from "#/server/requests/submit";
import {
  InvalidTransitionError,
  targetKey,
  transitionRequest as transitionUnchecked,
} from "#/server/requests/transitions";
import { services } from "#/server/services";
import { removeBook } from "#/server/services/chaptarr/client";
import { settings } from "#/server/settings";
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

/** One request with every check; a refusal becomes an error with its HTTP status. */
async function requestTitle(
  context: RequestCaller,
  data: Parameters<typeof requestTitleUnchecked>[2],
) {
  try {
    return await requestTitleUnchecked(
      { db, services, settings, onApproved: submitInBackground },
      { user: context.session.user, permissions: context.permissions },
      data,
    );
  } catch (error) {
    if (error instanceof RequestRefusedError) {
      setResponseStatus(error.status);
      throw new Error(error.message, { cause: error });
    }
    throw error;
  }
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
        await requestTitle(context, {
          media: { type: data.type, id },
          rootFolderPath: data.rootFolderPath,
          qualityProfileId: data.qualityProfileId,
        });
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

/**
 * `rows` with each sent request's download in Chaptarr, or null: not sent, or
 * sent with nothing grabbed yet ("Downloading" only when Chaptarr's queue says
 * so). Requests Chaptarr first only queued are looked up too: it may have
 * started on them since.
 */
async function withDownloads<T extends { id: string; status: RequestStatus }>(rows: readonly T[]) {
  const sentIds = rows.filter((r) => r.status === "submitted").map((r) => r.id);
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
}

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
    return withDownloads(rows);
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

/** Deletes a request and its history from Storyrr (not from Chaptarr). Managers, or its requester while pending. */
export const deleteRequest = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(RequestIdSchema)
  .handler(({ data, context }) => {
    // Managers delete any request; requesters withdraw their own while it waits for approval.
    if (!hasPermission(context.permissions, "manage_requests")) {
      const row = getRequestRow(db, data.id);
      if (!row || row.userId !== context.session.user.id) return notFound();
      if (row.status !== "pending") {
        setResponseStatus(403);
        throw new Error(m.request_cannot_delete());
      }
    }
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
  .handler(async ({ context }) => {
    const { user } = context.session;
    const recent = listRequests(db, {
      userId: hasPermission(context.permissions, "view_requests") ? undefined : user.id,
      filter: "all",
    })
      .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20);
    const recentRequests = await withDownloads(recent);
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

/**
 * Where a title's active request stands, for its page while Chaptarr has it:
 * the request's status and the download's progress. Light enough to poll (the
 * catalog isn't asked again). Signed-in users.
 */
export const getTitleDownload = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(
    v.object({
      type: v.picklist(SEARCHABLE_TYPES),
      id: v.pipe(v.string(), v.nonEmpty(), v.maxLength(200)),
    }),
  )
  .handler(async ({ data }) => {
    const source = mediaSources[data.type];
    const active = activeRequestsByExternalId(db, {
      source: source.source,
      format: source.type,
      externalIds: [data.id],
    }).get(data.id);
    if (!active) return { status: null, download: null };
    const [row] = await withDownloads([{ id: active.requestId, status: active.status }]);
    return { status: active.status, download: row?.download ?? null };
  });
