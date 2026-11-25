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
import {
  MEDIA_SERVERS,
  MediaServerSignInSchema,
  UnlinkMediaServerSchema,
} from "#/lib/media-server-login";
import { hasPermission, type Permission } from "#/lib/permissions";
import { CHAPTARR_FORMATS } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";
import { auth } from "#/server/auth";
import { setAccountPassword, updateAccount } from "#/server/auth/accounts";
import { linkedServers, linkOwnAccount, unlinkAccount } from "#/server/auth/media-server";
import { requirePermission, requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { ownerId } from "#/server/owner";
import { request, user, userPreference } from "#/server/db/schema";
import { setUserLocale } from "#/server/profile";
import { accountLock, permissionsOf } from "#/server/permissions";
import { requestQuota } from "#/server/requests/quota";
import { services } from "#/server/services";
import { settings } from "#/server/settings";
import { mediaServerSignIn } from "#/server/settings/definitions";

type Caller = { session: { user: { id: string } }; permissions: readonly Permission[] };

const accountLockMessage = {
  owner: m.users_owner_protected,
  admin_only: m.users_admin_only,
  outranked: m.users_outranked,
} as const;

/**
 * Whose account a call is about: the caller's own, or (user managers) the
 * given user's. `write`: the caller must be allowed to change it (see
 * `accountLock`). Throws 403 / 404 otherwise.
 */
async function resolveTarget(caller: Caller, userId: string | undefined, write = false) {
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
  const owner = row.id === ownerId(db);
  const lock = self ? null : await accountLock({ db, settings }, caller.permissions, row);
  if (write && lock) {
    setResponseStatus(403);
    throw new Error(accountLockMessage[lock]());
  }
  return { row, self, owner, lock, editable: lock === null };
}

/** An account's details, request counts, permissions and limits (own, or any for admins). */
export const getAccount = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(AccountTargetSchema)
  .handler(async ({ data, context }) => {
    const { row, self, owner, lock, editable } = await resolveTarget(context, data.userId);
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
      /** The Owner of Storyrr (only they change their account). */
      isOwner: owner,
      /** Whether the caller may change this account. */
      editable,
      /** Why they may not (null when they may). */
      lock,
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

/** Display name, email and language: one's own, or (user managers) another account's. */
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(ProfileSchema)
  .handler(async ({ data, context }) => {
    const { row, self } = await resolveTarget(context, data.userId, true);
    if (data.email.toLowerCase() !== row.email.toLowerCase()) {
      // Emails are unique: say so on the field rather than failing on the constraint.
      const taken = db
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${data.email.toLowerCase()}`)
        .get();
      if (taken)
        return { ok: false as const, field: "email" as const, message: m.profile_email_taken() };
    }
    if (self && data.email === row.email) {
      if (data.name !== row.name)
        await auth.api.updateUser({ body: { name: data.name }, headers: getRequestHeaders() });
    } else if (data.name !== row.name || data.email !== row.email) {
      // Invite-only instance: no verification email (none may be set up); the change is direct.
      await updateAccount(row.id, { name: data.name, email: data.email.toLowerCase() });
    }
    setUserLocale(db, row.id, data.locale === "default" ? null : data.locale);
    return { ok: true as const };
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
    await resolveTarget(context, data.userId, true);
    await setAccountPassword(data.userId, data.newPassword);
    return { ok: true };
  });

/** The media servers one can sign in with, and whether the caller's account is linked to each. */
export const getLinkedAccounts = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const config = await settings.get(mediaServerSignIn);
    const linked = new Set(linkedServers(db, context.session.user.id));
    return MEDIA_SERVERS.filter((server) => config?.[server].enabled).map((server) => ({
      server,
      linked: linked.has(server),
    }));
  });

/** Links the caller to their media-server account (its password proves it's theirs). */
export const linkMediaServer = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(MediaServerSignInSchema)
  .handler(({ data, context }) =>
    linkOwnAccount({ db, services, settings }, context.session.user.id, data),
  );

/** Removes the caller's link to a media server. */
export const unlinkMediaServer = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(UnlinkMediaServerSchema)
  .handler(({ data, context }) => {
    unlinkAccount(db, data.server, context.session.user.id);
    return { ok: true };
  });
