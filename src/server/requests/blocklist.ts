import "@tanstack/react-start/server-only";
import { and, desc, eq, inArray } from "drizzle-orm";

import type { MediaSummary } from "#/lib/media";
import type { AppDatabase } from "#/server/db/client";
import { blocklistItem, user } from "#/server/db/schema";

/** The given external ids (of one provider) that are blocked. */
export function blockedIds(
  db: AppDatabase,
  source: string,
  externalIds: readonly string[],
): Set<string> {
  if (externalIds.length === 0) return new Set();
  const rows = db
    .select({ externalId: blocklistItem.externalId })
    .from(blocklistItem)
    .where(and(eq(blocklistItem.source, source), inArray(blocklistItem.externalId, externalIds)))
    .all();
  return new Set(rows.map((row) => row.externalId));
}

export function findBlock(db: AppDatabase, source: string, externalId: string) {
  return db
    .select({ id: blocklistItem.id, reason: blocklistItem.reason })
    .from(blocklistItem)
    .where(and(eq(blocklistItem.source, source), eq(blocklistItem.externalId, externalId)))
    .get();
}

/** Blocks a work (idempotent: blocking again updates the reason). */
export function block(
  db: AppDatabase,
  item: Pick<MediaSummary, "type" | "source" | "externalId" | "title" | "coverUrl">,
  { reason, userId }: { reason: string | null; userId: string },
): string {
  return db
    .insert(blocklistItem)
    .values({
      type: item.type,
      source: item.source,
      externalId: item.externalId,
      title: item.title,
      coverUrl: item.coverUrl ?? null,
      reason,
      createdBy: userId,
    })
    .onConflictDoUpdate({
      target: [blocklistItem.source, blocklistItem.externalId],
      set: { reason, createdBy: userId, createdAt: new Date() },
    })
    .returning({ id: blocklistItem.id })
    .get().id;
}

export function unblock(db: AppDatabase, id: string): boolean {
  return (
    db
      .delete(blocklistItem)
      .where(eq(blocklistItem.id, id))
      .returning({ id: blocklistItem.id })
      .all().length > 0
  );
}

/** The blocklist, newest first, with who blocked each item. */
export function listBlocklist(db: AppDatabase) {
  return db
    .select({
      id: blocklistItem.id,
      type: blocklistItem.type,
      externalId: blocklistItem.externalId,
      title: blocklistItem.title,
      coverUrl: blocklistItem.coverUrl,
      reason: blocklistItem.reason,
      createdAt: blocklistItem.createdAt,
      createdByName: user.name,
    })
    .from(blocklistItem)
    .leftJoin(user, eq(user.id, blocklistItem.createdBy))
    .orderBy(desc(blocklistItem.createdAt))
    .all();
}
