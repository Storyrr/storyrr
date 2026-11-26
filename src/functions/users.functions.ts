import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import {
  CreateUserSchema,
  SetBannedSchema,
  SetPermissionsSchema,
  SetRequestLimitsSchema,
  SetRoleSchema,
  UserIdSchema,
} from "#/lib/schemas/users";
import { MEDIA_SERVERS, type MediaServer } from "#/lib/media-server-login";
import { holdsMoreThan, type Permission } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";
import { auth } from "#/server/auth";
import { banAccount, removeAccount, unbanAccount, updateAccount } from "#/server/auth/accounts";
import { requireAdmin, requirePermission } from "#/server/auth/middleware";
import {
  emailInUse,
  linkAccount,
  linkedUserId,
  placeholderEmail,
} from "#/server/auth/media-server";
import { services } from "#/server/services";
import { fail, ok } from "#/server/services/result";
import { db } from "#/server/db";
import { user } from "#/server/db/schema";
import { accountLock, defaultPermissions, setUserPermissions } from "#/server/permissions";
import { settings } from "#/server/settings";
import { setUserRequestLimits } from "#/server/requests/quota";
import { listUsers } from "#/server/users";

const requireManageUsers = requirePermission("manage_users");

type Caller = { session: { user: { id: string } }; permissions: readonly Permission[] };

/**
 * Checks a change to another account: never one's own (no locking oneself out),
 * never the Owner's, and only admins change admins or accounts with permissions
 * the caller lacks. The change itself goes through `#/server/auth/accounts`.
 */
async function assertCanManage(caller: Caller, userId: string) {
  if (userId === caller.session.user.id) {
    setResponseStatus(409);
    throw new Error(m.users_not_yourself());
  }
  const target = db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  if (!target) {
    setResponseStatus(404);
    throw new Error(m.users_not_found());
  }
  const lock = await accountLock({ db, settings }, caller.permissions, target);
  if (lock) {
    setResponseStatus(403);
    throw new Error(accountLockMessage[lock]());
  }
}

const accountLockMessage = {
  owner: m.users_owner_protected,
  admin_only: m.users_admin_only,
  outranked: m.users_outranked,
} as const;

export const getUsers = createServerFn({ method: "GET" })
  .middleware([requireManageUsers])
  .handler(() => listUsers(db));

/** Creates an account (invite-only: the creator hands over the temporary password). */
export const createUser = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(CreateUserSchema)
  .handler(async ({ data, context }) => {
    // A new account gets the default permissions: a manager who holds fewer
    // can't create one (and sign in as it) to get them.
    if (holdsMoreThan(await defaultPermissions(settings), context.permissions)) {
      setResponseStatus(403);
      throw new Error(m.users_grant_beyond_yours());
    }
    const { user: created } = await auth.api.createUser({
      body: { name: data.name, email: data.email, password: data.password, role: "user" },
    });
    return { id: created.id };
  });

/** Grants or removes the admin role. Admins only. */
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(SetRoleSchema)
  .handler(async ({ data, context }) => {
    await assertCanManage(context, data.userId);
    await updateAccount(data.userId, { role: data.role });
    return { ok: true };
  });

/** A user's own permissions (null: the defaults). */
export const setUserPermissionList = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(SetPermissionsSchema)
  .handler(async ({ data, context }) => {
    await assertCanManage(context, data.userId);
    if (data.permissions && holdsMoreThan(data.permissions, context.permissions)) {
      setResponseStatus(403);
      throw new Error(m.users_grant_beyond_yours());
    }
    setUserPermissions(db, data.userId, data.permissions);
    return { ok: true };
  });

/** Banning signs the user out everywhere and blocks sign-in until unbanned. */
export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(SetBannedSchema)
  .handler(async ({ data, context }) => {
    await assertCanManage(context, data.userId);
    if (data.banned) await banAccount(data.userId);
    else await unbanAccount(data.userId);
    return { ok: true };
  });

/** Deletes the account with its requests and issues. */
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(UserIdSchema)
  .handler(async ({ data, context }) => {
    await assertCanManage(context, data.userId);
    await removeAccount(data.userId);
    return { ok: true };
  });

/** Per-user request limits (null: the global ones from Settings → Users). */
export const setUserLimits = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(SetRequestLimitsSchema)
  .handler(async ({ data, context }) => {
    await assertCanManage(context, data.userId);
    setUserRequestLimits(db, data.userId, data.requestLimits);
    return { ok: true };
  });

const ServerSchema = v.object({ server: v.picklist(MEDIA_SERVERS) });

/**
 * A media server's accounts, with whether each already has a Storyrr account,
 * and whether its email is already another account's (not importable: that
 * user links it in their settings). User managers.
 */
export const getImportableUsers = createServerFn({ method: "GET" })
  .middleware([requireManageUsers])
  .validator(ServerSchema)
  .handler(async ({ data }) => {
    const accounts = await serverAccounts(data.server);
    if (!accounts.ok) return { ok: false as const, error: accounts.error };
    return {
      ok: true as const,
      users: accounts.value.map((a) => ({
        ...a,
        imported: linkedUserId(db, data.server, a.key) !== null,
        emailTaken: a.email !== null && emailInUse(db, a.email),
      })),
    };
  });

/**
 * Creates Storyrr accounts for media-server accounts, linked to them, with the
 * default permissions. They sign in with their media-server password. Accounts
 * whose email a Storyrr account already uses are skipped: never linked by
 * email, their owner links them in their settings.
 */
export const importUsers = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(
    v.object({
      ...ServerSchema.entries,
      keys: v.pipe(v.array(v.pipe(v.string(), v.nonEmpty())), v.minLength(1), v.maxLength(200)),
    }),
  )
  .handler(async ({ data }) => {
    const accounts = await serverAccounts(data.server);
    if (!accounts.ok) throw new Error(accounts.error.message);
    let imported = 0;
    let skipped = 0;
    for (const account of accounts.value.filter((a) => data.keys.includes(a.key))) {
      if (linkedUserId(db, data.server, account.key)) continue;
      if (account.email && emailInUse(db, account.email)) {
        skipped++;
        continue;
      }
      const { user: created } = await auth.api.createUser({
        body: {
          name: account.name,
          email: account.email ?? placeholderEmail(data.server, account.key),
          // Unusable: they sign in through the media server (or reset it by email).
          password: randomBytes(24).toString("base64url"),
          role: "user",
        },
      });
      linkAccount(db, data.server, created.id, account.key);
      imported++;
    }
    return { imported, skipped };
  });

/** A media server's accounts, keyed like sign-in links (ABS, Komga and Jellyfin ids, Kavita lowercased username). */
async function serverAccounts(server: MediaServer) {
  if (server === "audiobookshelf") {
    const abs = await services.audiobookshelf();
    if (!abs) return fail("not_configured", "Audiobookshelf is not configured");
    const result = await abs.users();
    if (!result.ok) return result;
    return ok(result.value.map((u) => ({ key: u.id, name: u.username, email: u.email ?? null })));
  }
  if (server === "jellyfin") {
    const jellyfin = await services.jellyfin();
    if (!jellyfin) return fail("not_configured", "Jellyfin is not configured");
    const result = await jellyfin.users();
    if (!result.ok) return result;
    return ok(result.value.map((u) => ({ key: u.Id, name: u.Name, email: null })));
  }
  if (server === "komga") {
    const komga = await services.komga();
    if (!komga) return fail("not_configured", "Komga is not configured");
    const result = await komga.users();
    if (!result.ok) return result;
    return ok(
      result.value.map((u) => ({
        key: u.id,
        name: u.email.split("@")[0] ?? u.email,
        email: u.email,
      })),
    );
  }
  const kavita = await services.kavita();
  if (!kavita) return fail("not_configured", "Kavita is not configured");
  const result = await kavita.users();
  if (!result.ok) return result;
  return ok(
    result.value.map((u) => ({
      key: u.username.toLowerCase(),
      name: u.username,
      email: u.email ?? null,
    })),
  );
}
