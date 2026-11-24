import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { MEDIA_TYPES } from "#/lib/requests";

import { user } from "./auth";

/** Works admins blocked from being requested (Seerr's blocklist). */
export const blocklistItem = sqliteTable(
  "blocklist_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: text("type", { enum: MEDIA_TYPES }).notNull(),
    /** Metadata provider and its id, as in `media`. */
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    coverUrl: text("cover_url"),
    reason: text("reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [uniqueIndex("blocklist_item_source_external_id_idx").on(t.source, t.externalId)],
);
