import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * App settings edited in the UI (service connections, defaults, policies).
 * `value` is JSON; values holding secrets are stored encrypted (see
 * `src/server/settings/crypto.ts`).
 */
export const setting = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});
