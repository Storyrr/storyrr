import "@tanstack/react-start/server-only";
import { asc, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "#/server/db/client";
import { request, user, userPreference } from "#/server/db/schema";
import { ownerId } from "#/server/owner";

/** Every account with its role, ban, own permissions and limits, and number of requests. */
export function listUsers(db: AppDatabase) {
  const owner = ownerId(db);
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
      requestLimits: userPreference.requestLimits,
      permissions: userPreference.permissions,
      requests: sql`(select count(*) from ${request} where ${request.userId} = ${user.id})`.mapWith(
        Number,
      ),
    })
    .from(user)
    .leftJoin(userPreference, eq(userPreference.userId, user.id))
    .orderBy(asc(user.createdAt))
    .all()
    .map((row) => ({ ...row, owner: row.id === owner }));
}
