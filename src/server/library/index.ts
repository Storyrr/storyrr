import "@tanstack/react-start/server-only";
import { and, eq, inArray, sql } from "drizzle-orm";

import { titleKey } from "#/lib/match";

import type { AppDatabase } from "#/server/db/client";
import { libraryItem } from "#/server/db/schema";
import type { AudiobookshelfClient } from "#/server/services/audiobookshelf/client";
import type { KavitaClient } from "#/server/services/kavita/client";
import type { ServiceResult } from "#/server/services/result";
import { ok } from "#/server/services/result";

export type SyncOptions = {
  /** Library ids left out of the index (Settings → Audiobookshelf / Kavita). */
  excluded?: readonly string[];
  now?: Date;
};

/** Items indexed per library, and when the backend was last synced. */
export function libraryStats(db: AppDatabase, backend: "audiobookshelf" | "kavita") {
  const rows = db
    .select({
      libraryId: libraryItem.libraryId,
      count: sql`count(distinct ${libraryItem.itemId})`.mapWith(Number),
      syncedAt: sql`max(${libraryItem.syncedAt})`.mapWith(Number),
    })
    .from(libraryItem)
    .where(eq(libraryItem.backend, backend))
    .groupBy(libraryItem.libraryId)
    .all();
  const lastSync = Math.max(0, ...rows.map((row) => row.syncedAt));
  return {
    counts: new Map(rows.map((row) => [row.libraryId, row.count])),
    lastSyncedAt: lastSync > 0 ? new Date(lastSync) : null,
  };
}

/** Replaces the Audiobookshelf part of the library index with what ABS holds now. */
export async function syncAudiobookshelf(
  db: AppDatabase,
  abs: AudiobookshelfClient,
  { excluded = [], now = new Date() }: SyncOptions = {},
): Promise<ServiceResult<{ items: number }>> {
  const items = await abs.allItems(new Set(excluded));
  if (!items.ok) return items;
  db.transaction((tx) => {
    tx.delete(libraryItem).where(eq(libraryItem.backend, "audiobookshelf")).run();
    for (const item of items.value) {
      tx.insert(libraryItem)
        .values({
          backend: "audiobookshelf",
          itemId: item.itemId,
          libraryId: item.libraryId,
          externalId: item.asin,
          matchKey: titleKey(item.title),
          title: item.title,
          author: item.author,
          syncedAt: now,
        })
        .onConflictDoNothing()
        .run();
    }
  });
  return ok({ items: items.value.length });
}

/** The given ASINs that a library already holds. */
export function ownedAsins(db: AppDatabase, asins: readonly string[]): Set<string> {
  if (asins.length === 0) return new Set();
  const rows = db
    .selectDistinct({ asin: libraryItem.externalId })
    .from(libraryItem)
    .where(
      inArray(
        libraryItem.externalId,
        asins.map((a) => a.toUpperCase()),
      ),
    )
    .all();
  return new Set(rows.flatMap((row) => (row.asin ? [row.asin] : [])));
}

/**
 * Replaces the Kavita part of the library index. Kavita series carry no
 * shared ID, so each of a series' names is indexed by its normalized title.
 */
export async function syncKavita(
  db: AppDatabase,
  kavita: KavitaClient,
  { excluded = [], now = new Date() }: SyncOptions = {},
): Promise<ServiceResult<{ series: number }>> {
  const all = await kavita.allSeries();
  if (!all.ok) return all;
  const skip = new Set(excluded);
  const series = all.value.filter((item) => !skip.has(String(item.libraryId)));
  db.transaction((tx) => {
    tx.delete(libraryItem).where(eq(libraryItem.backend, "kavita")).run();
    for (const item of series) {
      for (const [index, name] of item.names.entries()) {
        tx.insert(libraryItem)
          .values({
            backend: "kavita",
            itemId: `${item.seriesId}#${index}`,
            libraryId: String(item.libraryId),
            externalId: null,
            matchKey: titleKey(name),
            title: name,
            author: "",
            syncedAt: now,
          })
          .onConflictDoNothing()
          .run();
      }
    }
  });
  return ok({ series: series.length });
}

/** Which of these titles Kavita probably holds (normalized title match: no shared ID). */
export function ownedTitles(db: AppDatabase, titles: readonly string[]): Set<string> {
  const keys = [...new Set(titles.map(titleKey).filter(Boolean))];
  if (keys.length === 0) return new Set();
  const rows = db
    .selectDistinct({ key: libraryItem.matchKey })
    .from(libraryItem)
    .where(and(eq(libraryItem.backend, "kavita"), inArray(libraryItem.matchKey, keys)))
    .all();
  return new Set(rows.flatMap((row) => (row.key ? [row.key] : [])));
}
