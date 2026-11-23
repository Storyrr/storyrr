import "@tanstack/react-start/server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { relations } from "./relations";

/** drizzle-kit output, resolved from the working directory (`/app/drizzle` in the Docker image). */
export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

/**
 * Opens (or creates) the SQLite database and applies pending migrations, so
 * the schema is always current before the first query. Pass `":memory:"` for
 * a throwaway database in tests.
 */
export function createDatabase(file: string, migrationsFolder = MIGRATIONS_FOLDER) {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const sqlite = new Database(file);
  // WAL lets background jobs and webhooks write while pages read.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle({ client: sqlite, relations });
  migrate(db, { migrationsFolder });
  return db;
}

export type AppDatabase = ReturnType<typeof createDatabase>;
