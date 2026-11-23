import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * What the media servers already hold, refreshed by the library sync job.
 * Audiobooks are matched by ASIN (titles in libraries are often wrong).
 */
export const libraryItem = sqliteTable(
  "library_item",
  {
    /** "audiobookshelf" or "kavita". */
    backend: text("backend").notNull(),
    itemId: text("item_id").notNull(),
    libraryId: text("library_id").notNull(),
    /** ASIN for audiobooks, uppercased; null when the item has none. */
    externalId: text("external_id"),
    /** Normalized title (`titleKey`), for libraries without a shared ID (Kavita). */
    matchKey: text("match_key"),
    title: text("title").notNull(),
    author: text("author").notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.backend, t.itemId] }),
    index("library_item_external_id_idx").on(t.externalId),
    index("library_item_match_key_idx").on(t.backend, t.matchKey),
  ],
);
