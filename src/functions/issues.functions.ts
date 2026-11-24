import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";

import {
  CommentIssueSchema,
  IssueIdSchema,
  ListIssuesSchema,
  ReportIssueSchema,
  SetIssueStatusSchema,
} from "#/lib/schemas/issues";
import { m } from "#/paraglide/messages.js";
import { requireAdmin, requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import {
  addComment,
  canAccessIssue,
  createIssue,
  getIssue,
  listIssues,
  setIssueStatus,
} from "#/server/issues";
import { upsertMedia } from "#/server/requests/queries";
import { services } from "#/server/services";
import { mediaSources } from "#/server/sources";

function notFound(): never {
  setResponseStatus(404);
  throw new Error(m.issue_not_found());
}

/** Reports a problem on a title. Signed-in users. */
export const reportIssue = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(ReportIssueSchema)
  .handler(async ({ data, context }) => {
    const details = await mediaSources[data.media.type].getDetails(services, data.media.id);
    if (!details.ok) throw new Error(details.error.message);
    const mediaId = upsertMedia(db, details.value);
    return {
      id: createIssue(db, {
        mediaId,
        userId: context.session.user.id,
        type: data.type,
        message: data.message,
      }),
    };
  });

/** Every issue for admins, one's own otherwise. */
export const getIssues = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(ListIssuesSchema)
  .handler(({ data, context }) => {
    const { user } = context.session;
    return listIssues(db, {
      userId: user.role === "admin" ? undefined : user.id,
      status: data.status,
    });
  });

/** One issue and its comments: its reporter or an admin. */
export const getIssueById = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(IssueIdSchema)
  .handler(({ data, context }) => {
    const { user } = context.session;
    if (!canAccessIssue(db, data.id, { id: user.id, isAdmin: user.role === "admin" }))
      return notFound();
    const found = getIssue(db, data.id);
    return found ?? notFound();
  });

export const commentIssue = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(CommentIssueSchema)
  .handler(({ data, context }) => {
    const { user } = context.session;
    if (!canAccessIssue(db, data.id, { id: user.id, isAdmin: user.role === "admin" }))
      return notFound();
    addComment(db, { issueId: data.id, userId: user.id, message: data.message });
    return { ok: true };
  });

/** Resolves or reopens an issue. Admins. */
export const updateIssueStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(SetIssueStatusSchema)
  .handler(({ data }) => {
    if (!setIssueStatus(db, data.id, data.status)) return notFound();
    return { ok: true };
  });
