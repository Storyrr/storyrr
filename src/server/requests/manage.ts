import "@tanstack/react-start/server-only";
import { and, desc, eq, inArray } from "drizzle-orm";

import { titleKey } from "#/lib/match";
import type { MediaSummary } from "#/lib/media";
import type { RequestStatus } from "#/lib/requests";
import type { AppDatabase } from "#/server/db/client";
import { issue, libraryItem, media, request, user } from "#/server/db/schema";

import { transitionRequest } from "./transitions";

/*
 * Admin panel of a title (Seerr's "Manage"): its requests and issues, marking
 * it available by hand (when the library sync can't match it) and clearing
 * Storyrr's data about it.
 */

const MANUAL = "manual";
/** Requests not yet fulfilled, that marking a title available closes. */
const OPEN_STATUSES: RequestStatus[] = ["pending", "approved", "submitted", "failed"];
const manualItemId = (source: string, externalId: string) => `${source}:${externalId}`;

/** External ids of the given items an admin marked as available. */
export function manuallyOwned(db: AppDatabase, source: string, externalIds: readonly string[]) {
  if (externalIds.length === 0) return new Set<string>();
  const rows = db
    .select({ itemId: libraryItem.itemId })
    .from(libraryItem)
    .where(
      and(
        eq(libraryItem.backend, MANUAL),
        inArray(
          libraryItem.itemId,
          externalIds.map((id) => manualItemId(source, id)),
        ),
      ),
    )
    .all();
  const prefix = `${source}:`;
  return new Set(rows.map((row) => row.itemId.slice(prefix.length)));
}

/** The title's requests (newest first), open issues, and whether it was marked available. */
export function titleAdminInfo(db: AppDatabase, source: string, externalId: string) {
  const mediaRow = db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.source, source), eq(media.externalId, externalId)))
    .get();
  const requests = mediaRow
    ? db
        .select({
          id: request.id,
          status: request.status,
          format: request.format,
          createdAt: request.createdAt,
          requester: { id: user.id, name: user.name },
        })
        .from(request)
        .innerJoin(user, eq(user.id, request.userId))
        .where(eq(request.mediaId, mediaRow.id))
        .orderBy(desc(request.createdAt))
        .all()
    : [];
  const issues = mediaRow
    ? db
        .select({
          id: issue.id,
          type: issue.type,
          status: issue.status,
          createdAt: issue.createdAt,
        })
        .from(issue)
        .where(eq(issue.mediaId, mediaRow.id))
        .orderBy(desc(issue.createdAt))
        .all()
    : [];
  return {
    requests,
    issues,
    markedAvailable: manuallyOwned(db, source, [externalId]).has(externalId),
  };
}

/** Marks a title as in the library, and its active requests as available. */
export function markAvailable(
  db: AppDatabase,
  item: Pick<MediaSummary, "source" | "externalId" | "title" | "authors">,
  actor: string,
): number {
  db.insert(libraryItem)
    .values({
      backend: MANUAL,
      itemId: manualItemId(item.source, item.externalId),
      libraryId: MANUAL,
      externalId: null,
      matchKey: titleKey(item.title),
      title: item.title,
      author: item.authors.join(", "),
      syncedAt: new Date(),
    })
    .onConflictDoNothing()
    .run();
  const active = db
    .select({ id: request.id })
    .from(request)
    .innerJoin(media, eq(media.id, request.mediaId))
    .where(
      and(
        eq(media.source, item.source),
        eq(media.externalId, item.externalId),
        inArray(request.status, OPEN_STATUSES),
      ),
    )
    .all();
  for (const { id } of active) transitionRequest(db, id, { to: "available", actor });
  return active.length;
}

/**
 * Forgets what Storyrr knows about a title: its requests (with their history),
 * issues and manual availability. Nothing changes in Chaptarr or the libraries.
 */
export function clearTitleData(db: AppDatabase, source: string, externalId: string): void {
  db.transaction((tx) => {
    const mediaRow = tx
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.source, source), eq(media.externalId, externalId)))
      .get();
    if (mediaRow) {
      tx.delete(request).where(eq(request.mediaId, mediaRow.id)).run();
      tx.delete(issue).where(eq(issue.mediaId, mediaRow.id)).run();
    }
    tx.delete(libraryItem)
      .where(
        and(
          eq(libraryItem.backend, MANUAL),
          eq(libraryItem.itemId, manualItemId(source, externalId)),
        ),
      )
      .run();
  });
}
