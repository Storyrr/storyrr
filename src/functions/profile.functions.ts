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
import { CHAPTARR_FORMATS } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";
import { auth } from "#/server/auth";
import { requireAdmin, requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { request, user, userPreference } from "#/server/db/schema";
import { setUserLocale } from "#/server/profile";
import { isAutoApproved } from "#/server/requests/queries";
import { requestQuota } from "#/server/requests/quota";
import { settings } from "#/server/settings";

type Caller = { id: string; role?: string | null };

/**
 * Whose account a call is about: the caller's own, or (admins only) the
 * given user's. Throws 403 / 404 otherwise.
 */
function resolveTarget(caller: Caller, userId: string | undefined) {
  const id = userId ?? caller.id;
  const self = id === caller.id;
  if (!self && caller.role !== "admin") {
    setResponseStatus(403);
    throw new Error("Forbidden");
  }
  const row = db.select().from(user).where(eq(user.id, id)).get();
  if (!row) {
    setResponseStatus(404);
    throw new Error(m.users_not_found());
  }
  return { row, self };
}

/** An account's details, request counts, permissions and limits (own, or any for admins). */
export const getAccount = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(AccountTargetSchema)
  .handler(async ({ data, context }) => {
    const { row, self } = resolveTarget(context.session.user, data.userId);
    const isAdmin = row.role === "admin";
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
      /** The per-user flag (admins are approved anyway). */
      autoApprove: pref?.autoApprove ?? false,
      autoApproved: isAutoApproved(db, row.id, isAdmin),
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
    const { row, self } = resolveTarget(context.session.user, data.userId);
    const headers = getRequestHeaders();
    if (self) {
      if (data.name !== row.name) await auth.api.updateUser({ body: { name: data.name }, headers });
    } else if (data.name !== row.name || data.email !== row.email) {
      await auth.api.adminUpdateUser({
        body: { userId: row.id, data: { name: data.name, email: data.email } },
        headers,
      });
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

/** Admins set another user's password (e.g. a forgotten one). */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(SetPasswordSchema)
  .handler(async ({ data, context }) => {
    if (data.userId === context.session.user.id) {
      setResponseStatus(409);
      throw new Error(m.users_own_password());
    }
    await auth.api.setUserPassword({
      body: { userId: data.userId, newPassword: data.newPassword },
      headers: getRequestHeaders(),
    });
    return { ok: true };
  });
