import "@tanstack/react-start/server-only";
import { asc, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "#/server/db/client";
import { request, user, userPreference } from "#/server/db/schema";

/** Every account with its role, ban, auto-approval and number of requests. */
export function listUsers(db: AppDatabase) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
      requestLimits: userPreference.requestLimits,
      autoApprove: sql<number>`coalesce(${userPreference.autoApprove}, 0)`.mapWith(Boolean),
      requests: sql`(select count(*) from ${request} where ${request.userId} = ${user.id})`.mapWith(
        Number,
      ),
    })
    .from(user)
    .leftJoin(userPreference, eq(userPreference.userId, user.id))
    .orderBy(asc(user.createdAt))
    .all();
}

export function setAutoApprove(db: AppDatabase, userId: string, autoApprove: boolean): void {
  db.insert(userPreference)
    .values({ userId, autoApprove })
    .onConflictDoUpdate({ target: userPreference.userId, set: { autoApprove } })
    .run();
}
