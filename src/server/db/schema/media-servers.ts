import { primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/**
 * Which media-server account a Storyrr user is (sign in with a media server,
 * imported users). `accountKey` is the server's stable id for the account:
 * Audiobookshelf and Komga user ids, Jellyfin user ids, Kavita lowercased usernames.
 */
export const mediaServerAccount = sqliteTable(
  "media_server_account",
  {
    /** "audiobookshelf", "kavita", "komga" or "jellyfin" (`MEDIA_SERVERS`). */
    server: text("server").notNull(),
    accountKey: text("account_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.server, t.accountKey] }),
    // One account per server and user.
    uniqueIndex("media_server_account_user_idx").on(t.server, t.userId),
  ],
);
