import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { ACTIVE_REQUEST_STATUSES, MEDIA_TYPES, REQUEST_STATUSES } from "#/lib/requests";

import { user } from "./auth";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** A work as known by a metadata provider, cached locally. */
export const media = sqliteTable(
  "media",
  {
    id: id(),
    type: text("type", { enum: MEDIA_TYPES }).notNull(),
    /** Metadata provider: audible, hardcover, openlibrary, itunes. */
    source: text("source").notNull(),
    /** ASIN for audiobooks, Hardcover id for eBooks. */
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    authors: text("authors", { mode: "json" }).$type<string[]>().notNull().default([]),
    narrators: text("narrators", { mode: "json" }).$type<string[]>().notNull().default([]),
    series: text("series", { mode: "json" }).$type<{ name: string; position?: string }[]>(),
    language: text("language"),
    coverUrl: text("cover_url"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("media_source_external_id_idx").on(t.source, t.externalId)],
);

/** Where an approved request is sent (a Chaptarr root folder or an Audiobookshelf library). */
export type RequestTarget = { service: "chaptarr"; rootFolderPath: string };

export const request = sqliteTable(
  "request",
  {
    id: id(),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    format: text("format", { enum: MEDIA_TYPES }).notNull(),
    status: text("status", { enum: REQUEST_STATUSES }).notNull().default("pending"),
    target: text("target", { mode: "json" }).$type<RequestTarget>().notNull(),
    /** Canonical string form of `target`, for the active-request uniqueness rule. */
    targetKey: text("target_key").notNull(),
    qualityProfileId: integer("quality_profile_id"),
    /** Backend identifiers once submitted (Chaptarr author/book ids, ABS item id). */
    backendRef: text("backend_ref", { mode: "json" }).$type<Record<string, string | number>>(),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("request_user_id_idx").on(t.userId),
    index("request_status_idx").on(t.status),
    uniqueIndex("request_active_slot_idx")
      .on(t.mediaId, t.format, t.targetKey)
      .where(
        sql.raw(`status in (${ACTIVE_REQUEST_STATUSES.map((status) => `'${status}'`).join(", ")})`),
      ),
  ],
);

/** History: one row per status change (and one for creation, with no `from_status`). */
export const requestEvent = sqliteTable(
  "request_event",
  {
    id: id(),
    requestId: text("request_id")
      .notNull()
      .references(() => request.id, { onDelete: "cascade" }),
    /** A user id, or "system" / "webhook". */
    actor: text("actor").notNull(),
    fromStatus: text("from_status", { enum: REQUEST_STATUSES }),
    toStatus: text("to_status", { enum: REQUEST_STATUSES }).notNull(),
    message: text("message"),
    createdAt: createdAt(),
  },
  (t) => [index("request_event_request_id_idx").on(t.requestId)],
);

/** Other users who asked for the same thing while a request was active. */
export const requestWatcher = sqliteTable(
  "request_watcher",
  {
    requestId: text("request_id")
      .notNull()
      .references(() => request.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.requestId, t.userId] })],
);

/** Per-user app preferences (better-auth owns the user table itself). */
export const userPreference = sqliteTable("user_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  autoApprove: integer("auto_approve", { mode: "boolean" }).notNull().default(false),
  locale: text("locale"),
  absUserId: text("abs_user_id"),
});
