import "@tanstack/react-start/server-only";
import { asc, eq } from "drizzle-orm";

import type { AppDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";

/**
 * The Owner of Storyrr: the oldest admin account, which is the one the setup
 * wizard created (decided 2026-11-24, like Seerr's first user). Nobody else
 * can change, ban, demote or delete it, and it can't demote or delete itself,
 * so it stays the oldest admin; no flag is stored.
 */
export function ownerId(db: AppDatabase): string | null {
  const row = db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "admin"))
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(1)
    .get();
  return row?.id ?? null;
}
