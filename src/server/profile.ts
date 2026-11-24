import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";

import type { AppDatabase } from "#/server/db/client";
import { userPreference } from "#/server/db/schema";

/** The language the user picked in their settings, or null to follow the browser. */
export function userLocale(db: AppDatabase, userId: string): string | null {
  return (
    db
      .select({ locale: userPreference.locale })
      .from(userPreference)
      .where(eq(userPreference.userId, userId))
      .get()?.locale ?? null
  );
}

export function setUserLocale(db: AppDatabase, userId: string, locale: string | null): void {
  db.insert(userPreference)
    .values({ userId, locale })
    .onConflictDoUpdate({ target: userPreference.userId, set: { locale } })
    .run();
}
