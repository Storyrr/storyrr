import "@tanstack/react-start/server-only";
import { eq, inArray } from "drizzle-orm";

import type { AppDatabase } from "#/server/db/client";
import { libraryItem } from "#/server/db/schema";
import type { AudiobookshelfClient } from "#/server/services/audiobookshelf/client";
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
