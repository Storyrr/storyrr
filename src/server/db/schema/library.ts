import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * What Chaptarr and the media servers already hold, refreshed by the library
 * sync job. Chaptarr's books are matched by ID (ASIN, Hardcover id), like
 * Audiobookshelf's audiobooks (titles in libraries are often wrong); the other
 * servers have no shared ID and are matched by title.
 */
export const libraryItem = sqliteTable(
  "library_item",
  {
    /** "chaptarr", "audiobookshelf", "kavita", "komga" or "jellyfin". */
    backend: text("backend").notNull(),
    /** "audiobook" or "ebook": Jellyfin holds both. Null only on rows from before this column. */
    format: text("format", { enum: ["audiobook", "ebook"] }),
    itemId: text("item_id").notNull(),
    libraryId: text("library_id").notNull(),
    /** ASIN for audiobooks, uppercased; `hc:<id>` for Chaptarr's eBooks; null when the item has none. */
    externalId: text("external_id"),
    /** Normalized title (`titleKey`), for libraries without a shared ID (Kavita). */
    matchKey: text("match_key"),
    /**
     * The end of the item's file or folder path (`pathKey`): the same file seen by
     * Chaptarr and a media server differs only by where each one mounts it.
     */
    pathKey: text("path_key"),
    title: text("title").notNull(),
    author: text("author").notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.backend, t.itemId] }),
    index("library_item_external_id_idx").on(t.externalId),
    index("library_item_match_key_idx").on(t.backend, t.matchKey),
    index("library_item_format_key_idx").on(t.format, t.matchKey),
    index("library_item_path_key_idx").on(t.pathKey),
  ],
);
