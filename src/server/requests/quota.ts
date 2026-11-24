import "@tanstack/react-start/server-only";
import { and, eq, gte, notInArray, sql } from "drizzle-orm";

import type { MediaType } from "#/lib/requests";
import {
  DEFAULT_USER_SETTINGS,
  type RequestLimit,
  type RequestLimits,
} from "#/lib/schemas/settings";
import type { AppDatabase } from "#/server/db/client";
import { request, userPreference } from "#/server/db/schema";
import { userSettings } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a user may still request of one format; `remaining: null` is unlimited. */
export type RequestQuota = {
  limit: number | null;
  days: number;
  used: number;
  remaining: number | null;
};

/** The user's own limits, else the global ones. */
export async function effectiveLimit(
  { db, settings }: { db: AppDatabase; settings: SettingsStore },
  userId: string,
  format: MediaType,
): Promise<RequestLimit> {
  const pref = db
    .select({ limits: userPreference.requestLimits })
    .from(userPreference)
    .where(eq(userPreference.userId, userId))
    .get();
  if (pref?.limits) return pref.limits[format];
  const global = (await settings.get(userSettings)) ?? DEFAULT_USER_SETTINGS;
  return global.requestLimits[format];
}

/**
 * Requests of a format made in the period. Denied and cancelled ones give
 * their slot back (Seerr counts them the same way).
 */
export function countRecentRequests(
  db: AppDatabase,
  userId: string,
  format: MediaType,
  days: number,
  now = new Date(),
): number {
  const row = db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(request)
    .where(
      and(
        eq(request.userId, userId),
        eq(request.format, format),
        gte(request.createdAt, new Date(now.getTime() - days * DAY_MS)),
        notInArray(request.status, ["denied", "cancelled"]),
      ),
    )
    .get();
  return row?.count ?? 0;
}

/** Admins are never limited. */
export async function requestQuota(
  deps: { db: AppDatabase; settings: SettingsStore },
  user: { id: string; isAdmin: boolean },
  format: MediaType,
  now = new Date(),
): Promise<RequestQuota> {
  const { limit, days } = await effectiveLimit(deps, user.id, format);
  if (user.isAdmin || limit === null) return { limit: null, days, used: 0, remaining: null };
  const used = countRecentRequests(deps.db, user.id, format, days, now);
  return { limit, days, used, remaining: Math.max(0, limit - used) };
}

export function setUserRequestLimits(
  db: AppDatabase,
  userId: string,
  requestLimits: RequestLimits | null,
): void {
  db.insert(userPreference)
    .values({ userId, requestLimits })
    .onConflictDoUpdate({ target: userPreference.userId, set: { requestLimits } })
    .run();
}
