import "@tanstack/react-start/server-only";
import { and, eq, inArray } from "drizzle-orm";

import { titleKey } from "#/lib/match";

import type { AppDatabase } from "#/server/db/client";
import { libraryItem } from "#/server/db/schema";
import type { AudiobookshelfClient } from "#/server/services/audiobookshelf/client";
import type { KavitaClient } from "#/server/services/kavita/client";
import type { ServiceResult } from "#/server/services/result";
import { ok } from "#/server/services/result";

/** Replaces the Audiobookshelf part of the library index with what ABS holds now. */
export async function syncAudiobookshelf(
  db: AppDatabase,
  abs: AudiobookshelfClient,
  now = new Date(),
): Promise<ServiceResult<{ items: number }>> {
  const items = await abs.allBookItems();
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
  now = new Date(),
): Promise<ServiceResult<{ series: number }>> {
  const series = await kavita.allSeries();
  if (!series.ok) return series;
  db.transaction((tx) => {
    tx.delete(libraryItem).where(eq(libraryItem.backend, "kavita")).run();
    for (const item of series.value) {
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
  return ok({ series: series.value.length });
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
