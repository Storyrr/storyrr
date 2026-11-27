import "@tanstack/react-start/server-only";
import { and, eq, inArray, ne, notLike, sql } from "drizzle-orm";

import { titleKey } from "#/lib/match";
import type { SearchableType } from "#/lib/media-types";
import type { LibraryService } from "#/lib/schemas/settings";

import type { AppDatabase } from "#/server/db/client";
import { libraryItem } from "#/server/db/schema";
import type { AudiobookshelfClient } from "#/server/services/audiobookshelf/client";
import { ownedBooks, type ChaptarrClient } from "#/server/services/chaptarr/client";
import type { KavitaClient } from "#/server/services/kavita/client";
import type { JellyfinClient } from "#/server/services/jellyfin/client";
import type { KomgaClient } from "#/server/services/komga/client";
import type { ServiceResult } from "#/server/services/result";
import { ok } from "#/server/services/result";

/**
 * Chaptarr holds files too: its books are indexed by their provider IDs, and by
 * title like the others (an audiobook has one ASIN per marketplace, and Chaptarr
 * may know another than Audible's).
 */
export type IndexBackend = LibraryService | "chaptarr";

/** The index key of a Hardcover book (ASINs are stored bare). */
export const hardcoverKey = (id: string) => `hc:${id}`;

export type SyncOptions = {
  /** Library ids left out of the index (each media server's settings tab). */
  excluded?: readonly string[];
  now?: Date;
};

/** One work a media server holds, under every title it's known by. */
export type IndexedItem = {
  itemId: string;
  libraryId: string;
  format: SearchableType;
  /** ASIN (audiobooks) or `hardcoverKey` (Chaptarr's eBooks); null when there's none. */
  externalId: string | null;
  titles: string[];
  author: string;
};

const KEYS_PER_QUERY = 500;
/** Rows after the first title of an item get `#n` ids: stats count the first ones only. */
const EXTRA_TITLE = "#";

/** Replaces a media server's part of the library index with what it holds now. */
export function replaceIndex(
  db: AppDatabase,
  backend: IndexBackend,
  items: readonly IndexedItem[],
  now = new Date(),
): void {
  db.transaction((tx) => {
    tx.delete(libraryItem).where(eq(libraryItem.backend, backend)).run();
    for (const item of items) {
      const titles = [...new Set(item.titles.filter(Boolean))];
      for (const [index, title] of titles.entries()) {
        tx.insert(libraryItem)
          .values({
            backend,
            itemId: index === 0 ? item.itemId : `${item.itemId}${EXTRA_TITLE}${index}`,
            libraryId: item.libraryId,
            format: item.format,
            externalId: item.externalId,
            matchKey: titleKey(title),
            title,
            author: item.author,
            syncedAt: now,
          })
          .onConflictDoNothing()
          .run();
      }
    }
  });
}

/** Forgets what a media server held (its connection was removed). */
export function clearIndex(db: AppDatabase, backend: IndexBackend): void {
  db.delete(libraryItem).where(eq(libraryItem.backend, backend)).run();
}

/** Items indexed per library, and when the backend was last synced. */
export function libraryStats(db: AppDatabase, backend: LibraryService) {
  const rows = db
    .select({
      libraryId: libraryItem.libraryId,
      count: sql`count(*)`.mapWith(Number),
      syncedAt: sql`max(${libraryItem.syncedAt})`.mapWith(Number),
    })
    .from(libraryItem)
    .where(and(eq(libraryItem.backend, backend), notLike(libraryItem.itemId, `%${EXTRA_TITLE}%`)))
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
  replaceIndex(
    db,
    "audiobookshelf",
    items.value.map((item) => ({
      itemId: item.itemId,
      libraryId: item.libraryId,
      format: "audiobook",
      externalId: item.asin,
      titles: [item.title],
      author: item.author,
    })),
    now,
  );
  return ok({ items: items.value.length });
}

/** The given index keys (ASINs, `hardcoverKey`s) that a library or Chaptarr holds. */
export function ownedExternalIds(db: AppDatabase, ids: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (let start = 0; start < ids.length; start += KEYS_PER_QUERY) {
    const rows = db
      .selectDistinct({ id: libraryItem.externalId })
      .from(libraryItem)
      .where(inArray(libraryItem.externalId, ids.slice(start, start + KEYS_PER_QUERY)))
      .all();
    for (const row of rows) if (row.id) found.add(row.id);
  }
  return found;
}

/** The given ASINs that a library or Chaptarr already holds. */
export const ownedAsins = (db: AppDatabase, asins: readonly string[]): Set<string> =>
  ownedExternalIds(
    db,
    asins.map((asin) => asin.toUpperCase()),
  );

/** The given Hardcover book ids that Chaptarr holds a file of. */
export function ownedHardcoverIds(db: AppDatabase, ids: readonly string[]): Set<string> {
  const owned = ownedExternalIds(db, ids.map(hardcoverKey));
  return new Set(ids.filter((id) => owned.has(hardcoverKey(id))));
}

const ASIN = /^[A-Z0-9]{10}$/;
/** The ASIN of an Amazon provider ID (`az:B0…`). */
const asinOf = (providerId: string) => (providerId.startsWith("az:") ? providerId.slice(3) : null);

/**
 * Replaces Chaptarr's part of the index: the books it holds a file of, under
 * each ID Storyrr can know them by (a Hardcover id for eBooks, ASINs for
 * audiobooks). A file deleted in Chaptarr leaves the index at the next sync.
 */
export async function syncChaptarr(
  db: AppDatabase,
  chaptarr: Pick<ChaptarrClient, "ownedBooksPage">,
  { now = new Date() }: Pick<SyncOptions, "now"> = {},
): Promise<ServiceResult<{ items: number }>> {
  const books = await ownedBooks(chaptarr);
  if (!books.ok) return books;
  const items = books.value.flatMap((book): IndexedItem[] => {
    const format = book.mediaType;
    if (format !== "audiobook" && format !== "ebook") return [];
    const provided = [book.foreignBookId, book.hardcoverBookId].flatMap((id) => (id ? [id] : []));
    const asins = [book.asin, book.audibleASIN, ...provided.map(asinOf)].flatMap((asin) =>
      asin && ASIN.test(asin.toUpperCase()) ? [asin.toUpperCase()] : [],
    );
    const ids = format === "ebook" ? provided.filter((id) => id.startsWith("hc:")) : asins;
    return [...new Set(ids)].map((externalId, index) => ({
      itemId: index === 0 ? String(book.id) : `${book.id}${EXTRA_TITLE}${index}`,
      libraryId: "",
      format,
      externalId,
      titles: [book.title ?? ""],
      author: book.authorTitle ?? "",
    }));
  });
  replaceIndex(db, "chaptarr", items, now);
  return ok({ items: books.value.length });
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
  replaceIndex(
    db,
    "kavita",
    series.map((item) => ({
      itemId: String(item.seriesId),
      libraryId: String(item.libraryId),
      format: "ebook",
      externalId: null,
      titles: item.names,
      author: "",
    })),
    now,
  );
  return ok({ series: series.length });
}

/** Replaces the Komga part of the library index: each series under all its titles (no shared ID). */
export async function syncKomga(
  db: AppDatabase,
  komga: KomgaClient,
  { excluded = [], now = new Date() }: SyncOptions = {},
): Promise<ServiceResult<{ items: number }>> {
  const all = await komga.allSeries();
  if (!all.ok) return all;
  const skip = new Set(excluded);
  const series = all.value.filter((item) => !skip.has(item.libraryId));
  replaceIndex(
    db,
    "komga",
    series.map((item) => ({
      itemId: item.seriesId,
      libraryId: item.libraryId,
      format: "ebook",
      externalId: null,
      titles: item.names,
      author: item.author,
    })),
    now,
  );
  return ok({ items: series.length });
}

/**
 * Replaces the Jellyfin part of the library index: its books and audiobooks,
 * each format on its own (no shared ID: matched by title). An audiobook's
 * files are one item per file in Jellyfin: they're grouped by album.
 */
export async function syncJellyfin(
  db: AppDatabase,
  jellyfin: JellyfinClient,
  { excluded = [], now = new Date() }: SyncOptions = {},
): Promise<ServiceResult<{ items: number }>> {
  const libraries = await jellyfin.libraries();
  if (!libraries.ok) return libraries;
  const skip = new Set(excluded);
  const all = await jellyfin.allItems(
    libraries.value.map((library) => library.id).filter((id) => !skip.has(id)),
  );
  if (!all.ok) return all;
  const grouped = new Map<string, IndexedItem>();
  for (const item of all.value) {
    const [first] = item.titles;
    const key =
      item.format === "audiobook" && first
        ? `${item.libraryId}|audiobook|${titleKey(first)}`
        : item.itemId;
    const existing = grouped.get(key);
    if (existing) {
      existing.titles = [...new Set([...existing.titles, ...item.titles])];
      continue;
    }
    grouped.set(key, {
      itemId: item.itemId,
      libraryId: item.libraryId,
      format: item.format,
      externalId: null,
      titles: item.titles,
      author: item.author,
    });
  }
  replaceIndex(db, "jellyfin", [...grouped.values()], now);
  return ok({ items: grouped.size });
}

/**
 * Which of these titles Chaptarr or a media server probably holds in this format
 * (normalized title match: no shared ID). Audiobookshelf is left out: its titles
 * are often wrong, it's matched by ASIN only.
 */
export function ownedTitles(
  db: AppDatabase,
  format: SearchableType,
  titles: readonly string[],
): Set<string> {
  const keys = [...new Set(titles.map(titleKey).filter(Boolean))];
  if (keys.length === 0) return new Set();
  const found = new Set<string>();
  // Translated titles can make thousands of keys: stay under SQLite's variable limit.
  for (let start = 0; start < keys.length; start += KEYS_PER_QUERY) {
    const rows = db
      .selectDistinct({ key: libraryItem.matchKey })
      .from(libraryItem)
      .where(
        and(
          eq(libraryItem.format, format),
          ne(libraryItem.backend, "audiobookshelf"),
          inArray(libraryItem.matchKey, keys.slice(start, start + KEYS_PER_QUERY)),
        ),
      )
      .all();
    for (const row of rows) if (row.key) found.add(row.key);
  }
  return found;
}
