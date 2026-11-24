import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";

import { expandPermissions, type AssignablePermission, type Permission } from "#/lib/permissions";
import { DEFAULT_USER_SETTINGS } from "#/lib/schemas/settings";
import type { AppDatabase } from "#/server/db/client";
import { userPreference } from "#/server/db/schema";
import { userSettings } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";

export type PermissionDeps = { db: AppDatabase; settings: SettingsStore };

/** Permissions explicitly granted to a user, or null when the defaults apply. */
export function grantedPermissions(db: AppDatabase, userId: string): AssignablePermission[] | null {
  return (
    db
      .select({ permissions: userPreference.permissions })
      .from(userPreference)
      .where(eq(userPreference.userId, userId))
      .get()?.permissions ?? null
  );
}

export async function defaultPermissions(settings: SettingsStore): Promise<AssignablePermission[]> {
  return ((await settings.get(userSettings)) ?? DEFAULT_USER_SETTINGS).defaultPermissions;
}

/** What a user can do: everything for admins, else their own or the default permissions, expanded. */
export async function permissionsOf(
  { db, settings }: PermissionDeps,
  user: { id: string; role?: string | null },
): Promise<Permission[]> {
  if (user.role === "admin") return expandPermissions(["admin"]);
  return expandPermissions(grantedPermissions(db, user.id) ?? (await defaultPermissions(settings)));
}

export function setUserPermissions(
  db: AppDatabase,
  userId: string,
  permissions: AssignablePermission[] | null,
): void {
  db.insert(userPreference)
    .values({ userId, permissions })
    .onConflictDoUpdate({ target: userPreference.userId, set: { permissions } })
    .run();
}
