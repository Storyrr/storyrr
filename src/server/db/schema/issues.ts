import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { ISSUE_STATUSES, ISSUE_TYPES } from "#/lib/issues";

import { user } from "./auth";
import { media } from "./requests";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull();

/** A problem a user reports on a title from the library (Seerr's issues). */
export const issue = sqliteTable(
  "issue",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type", { enum: ISSUE_TYPES }).notNull(),
    status: text("status", { enum: ISSUE_STATUSES }).notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("issue_status_idx").on(t.status), index("issue_user_id_idx").on(t.userId)],
);

/** The discussion of an issue; the first comment is the report itself. */
export const issueComment = sqliteTable(
  "issue_comment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    issueId: text("issue_id")
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("issue_comment_issue_id_idx").on(t.issueId)],
);
