import "@tanstack/react-start/server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { IssueStatus, IssueType } from "#/lib/issues";
import type { AppDatabase } from "#/server/db/client";
import { emitAppEvent } from "#/server/events";
import { issue, issueComment, media, user } from "#/server/db/schema";

/** Opens an issue with the report as its first comment. */
export function createIssue(
  db: AppDatabase,
  input: { mediaId: string; userId: string; type: IssueType; message: string },
): string {
  const id = db.transaction((tx) => {
    const created = tx
      .insert(issue)
      .values({ mediaId: input.mediaId, userId: input.userId, type: input.type })
      .returning({ id: issue.id })
      .get();
    tx.insert(issueComment)
      .values({ issueId: created.id, userId: input.userId, message: input.message })
      .run();
    return created.id;
  });
  emitAppEvent({ kind: "issue_created", issueId: id, userId: input.userId });
  return id;
}

/** Issues, open first then most recently active; only the user's own when `userId` is set. */
export function listIssues(
  db: AppDatabase,
  { userId, status }: { userId?: string; status?: IssueStatus },
) {
  return db
    .select({
      id: issue.id,
      type: issue.type,
      status: issue.status,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      reporter: { id: user.id, name: user.name },
      media: {
        type: media.type,
        externalId: media.externalId,
        title: media.title,
        coverUrl: media.coverUrl,
      },
      comments:
        sql`(select count(*) from ${issueComment} where ${issueComment.issueId} = ${issue.id})`.mapWith(
          Number,
        ),
    })
    .from(issue)
    .innerJoin(media, eq(media.id, issue.mediaId))
    .innerJoin(user, eq(user.id, issue.userId))
    .where(
      and(
        userId ? eq(issue.userId, userId) : undefined,
        status ? eq(issue.status, status) : undefined,
      ),
    )
    .orderBy(sql`case when ${issue.status} = 'open' then 0 else 1 end`, desc(issue.updatedAt))
    .all();
}

export function getIssue(db: AppDatabase, id: string) {
  const row = listIssueRow(db, id);
  if (!row) return null;
  const comments = db
    .select({
      id: issueComment.id,
      message: issueComment.message,
      createdAt: issueComment.createdAt,
      userId: issueComment.userId,
      userName: user.name,
    })
    .from(issueComment)
    .leftJoin(user, eq(user.id, issueComment.userId))
    .where(eq(issueComment.issueId, id))
    .orderBy(asc(issueComment.createdAt))
    .all();
  return { ...row, comments };
}

function listIssueRow(db: AppDatabase, id: string) {
  return db
    .select({
      id: issue.id,
      type: issue.type,
      status: issue.status,
      createdAt: issue.createdAt,
      reporter: { id: user.id, name: user.name },
      media: {
        type: media.type,
        externalId: media.externalId,
        title: media.title,
        coverUrl: media.coverUrl,
        authors: media.authors,
      },
    })
    .from(issue)
    .innerJoin(media, eq(media.id, issue.mediaId))
    .innerJoin(user, eq(user.id, issue.userId))
    .where(eq(issue.id, id))
    .get();
}

export function addComment(
  db: AppDatabase,
  input: { issueId: string; userId: string; message: string },
): void {
  db.transaction((tx) => {
    tx.insert(issueComment).values(input).run();
    tx.update(issue).set({ updatedAt: new Date() }).where(eq(issue.id, input.issueId)).run();
  });
  emitAppEvent({ kind: "issue_comment", ...input });
}

export function setIssueStatus(db: AppDatabase, id: string, status: IssueStatus): boolean {
  const updated =
    db
      .update(issue)
      .set({ status, updatedAt: new Date() })
      .where(eq(issue.id, id))
      .returning({ id: issue.id })
      .all().length > 0;
  if (updated) emitAppEvent({ kind: "issue_status", issueId: id, status });
  return updated;
}

/** Whether the user may see and comment on the issue (its reporter, or an admin). */
export function canAccessIssue(
  db: AppDatabase,
  id: string,
  viewer: { id: string; isAdmin: boolean },
): boolean {
  if (viewer.isAdmin)
    return db.select({ id: issue.id }).from(issue).where(eq(issue.id, id)).get() !== undefined;
  return (
    db
      .select({ id: issue.id })
      .from(issue)
      .where(and(eq(issue.id, id), eq(issue.userId, viewer.id)))
      .get() !== undefined
  );
}
