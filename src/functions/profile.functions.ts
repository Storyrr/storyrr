import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { APIError } from "better-auth/api";
import { eq, sql } from "drizzle-orm";

import {
  AccountTargetSchema,
  ChangePasswordSchema,
  ProfileSchema,
  SetPasswordSchema,
} from "#/lib/schemas/profile";
import { hasPermission, type Permission } from "#/lib/permissions";
import { CHAPTARR_FORMATS } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";
import { auth } from "#/server/auth";
import { setAccountPassword, updateAccount } from "#/server/auth/accounts";
import { requirePermission, requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { request, user, userPreference } from "#/server/db/schema";
import { setUserLocale } from "#/server/profile";
import { permissionsOf } from "#/server/permissions";
import { requestQuota } from "#/server/requests/quota";
import { settings } from "#/server/settings";

type Caller = { session: { user: { id: string } }; permissions: readonly Permission[] };

/**
 * Whose account a call is about: the caller's own, or (user managers) the
 * given user's. `write`: only admins change an admin's account. Throws
 * 403 / 404 otherwise.
 */
function resolveTarget(caller: Caller, userId: string | undefined, write = false) {
  const id = userId ?? caller.session.user.id;
  const self = id === caller.session.user.id;
  if (!self && !hasPermission(caller.permissions, "manage_users")) {
    setResponseStatus(403);
    throw new Error("Forbidden");
  }
  const row = db.select().from(user).where(eq(user.id, id)).get();
  if (!row) {
    setResponseStatus(404);
    throw new Error(m.users_not_found());
  }
  if (write && !self && row.role === "admin" && !hasPermission(caller.permissions, "admin")) {
    setResponseStatus(403);
    throw new Error(m.users_admin_only());
  }
  return { row, self };
}

/** An account's details, request counts, permissions and limits (own, or any for admins). */
export const getAccount = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(AccountTargetSchema)
  .handler(async ({ data, context }) => {
    const { row, self } = resolveTarget(context, data.userId);
    const isAdmin = row.role === "admin";
    const permissions = await permissionsOf({ db, settings }, row);
    const pref = db.select().from(userPreference).where(eq(userPreference.userId, row.id)).get();
    const counts = db
      .select({ total: sql`count(*)`.mapWith(Number) })
      .from(request)
      .where(eq(request.userId, row.id))
      .get();
    const quotas = await Promise.all(
      CHAPTARR_FORMATS.map((format) =>
        requestQuota({ db, settings }, { id: row.id, isAdmin }, format),
      ),
    );
    return {
      id: row.id,
      self,
      name: row.name,
      email: row.email,
      createdAt: row.createdAt,
      isAdmin,
      banned: row.banned ?? false,
      locale: pref?.locale ?? null,
      /** Effective permissions (with the defaults and what they imply). */
      permissions,
      /** Own permissions; null uses the defaults from Settings → Users. */
      grantedPermissions: pref?.permissions ?? null,
      /** Own limits; null uses the global ones. */
      requestLimits: pref?.requestLimits ?? null,
      requests: { total: counts?.total ?? 0 },
      quotas: { audiobook: quotas[0], ebook: quotas[1] },
    };
  });

/**
 * Display name and language. Users change their own name; admins can also
 * change another account's email.
 */
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(ProfileSchema)
  .handler(async ({ data, context }) => {
    const { row, self } = resolveTarget(context, data.userId, true);
    if (self) {
      if (data.name !== row.name)
        await auth.api.updateUser({ body: { name: data.name }, headers: getRequestHeaders() });
    } else if (data.name !== row.name || data.email !== row.email) {
      await updateAccount(row.id, { name: data.name, email: data.email });
    }
    setUserLocale(db, row.id, data.locale === "default" ? null : data.locale);
    return { ok: true };
  });

/** Changes the caller's password and signs out their other sessions. */
export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(ChangePasswordSchema)
  .handler(async ({ data }) => {
    try {
      await auth.api.changePassword({
        body: { ...data, revokeOtherSessions: true },
        headers: getRequestHeaders(),
      });
    } catch (error) {
      if (error instanceof APIError && error.body?.code === "INVALID_PASSWORD") {
        return {
          ok: false as const,
          field: "currentPassword" as const,
          message: m.password_wrong(),
        };
      }
      throw error;
    }
    return { ok: true as const };
  });

/** User managers set another user's password (e.g. a forgotten one). */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requirePermission("manage_users")])
  .validator(SetPasswordSchema)
  .handler(async ({ data, context }) => {
    if (data.userId === context.session.user.id) {
      setResponseStatus(409);
      throw new Error(m.users_own_password());
    }
    resolveTarget(context, data.userId, true);
    await setAccountPassword(data.userId, data.newPassword);
    return { ok: true };
  });
