import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import {
  ApproveRequestSchema,
  CreateAudiobookRequestSchema,
  DenyRequestSchema,
  ListRequestsSchema,
  RequestIdSchema,
} from "#/lib/schemas/requests";
import { m } from "#/paraglide/messages.js";
import { requireAdmin, requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { request } from "#/server/db/schema";
import { runJob } from "#/server/jobs";
import {
  isAutoApproved,
  listRequests,
  requestHistory,
  upsertMedia,
  getRequestRow,
} from "#/server/requests/queries";
import { submitRequest } from "#/server/requests/submit";
import {
  createRequest,
  InvalidTransitionError,
  targetKey,
  transitionRequest as transitionUnchecked,
} from "#/server/requests/transitions";
import { services } from "#/server/services";
import { settings } from "#/server/settings";
import { audiobookDefaults } from "#/server/settings/definitions";

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

/**
 * Requests an audiobook. Admins may pick the target folder and quality profile;
 * everyone else gets the defaults. Signed-in users.
 */
export const requestAudiobook = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(CreateAudiobookRequestSchema)
  .handler(async ({ data, context }) => {
    const { user } = context.session;
    const isAdmin = user.role === "admin";
    const defaults = await settings.get(audiobookDefaults);
    const rootFolderPath = (isAdmin ? data.rootFolderPath : undefined) ?? defaults?.rootFolderPath;
    if (!rootFolderPath) throw new Error(m.request_error_defaults_missing());

    const audible = await services.audible();
    const details = await audible.getByAsin(data.asin);
    if (!details.ok) throw new Error(details.error.message);

    const mediaId = upsertMedia(db, details.value);
    const result = createRequest(db, {
      mediaId,
      userId: user.id,
      format: "audiobook",
      target: { service: "chaptarr", rootFolderPath },
      qualityProfileId: isAdmin ? (data.qualityProfileId ?? null) : null,
      autoApprove: isAutoApproved(db, user.id, isAdmin),
    });
    if (result.kind === "created" && result.status === "approved")
      submitInBackground(result.requestId);
    return result;
  });

/** The caller's requests (and those they watch), or every request for admins. */
export const getRequests = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(ListRequestsSchema)
  .handler(({ data, context }) => {
    const isAdmin = context.session.user.role === "admin";
    if (data.scope === "all" && !isAdmin) {
      setResponseStatus(403);
      throw new Error("Forbidden");
    }
    return listRequests(db, {
      userId: data.scope === "mine" ? context.session.user.id : undefined,
      filter: data.filter,
    });
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
