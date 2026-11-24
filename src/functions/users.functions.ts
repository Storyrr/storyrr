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
import { m } from "#/paraglide/messages.js";
import { auth } from "#/server/auth";
import { banAccount, removeAccount, unbanAccount, updateAccount } from "#/server/auth/accounts";
import { requireAdmin, requirePermission } from "#/server/auth/middleware";
import { linkAccount, linkedUserId, placeholderEmail } from "#/server/auth/media-server";
import { services } from "#/server/services";
import { fail, ok } from "#/server/services/result";
import { db } from "#/server/db";
import { user } from "#/server/db/schema";
import { setUserPermissions } from "#/server/permissions";
import { setUserRequestLimits } from "#/server/requests/quota";
import { listUsers } from "#/server/users";

const requireManageUsers = requirePermission("manage_users");

type Caller = { session: { user: { id: string } }; permissions: readonly string[] };

/**
 * Checks a change to another account: never one's own (no locking oneself out),
 * and only admins change admins. The change itself goes through
 * `#/server/auth/accounts`.
 */
function assertCanManage(caller: Caller, userId: string) {
  if (userId === caller.session.user.id) {
    setResponseStatus(409);
    throw new Error(m.users_not_yourself());
  }
  const target = db.select({ role: user.role }).from(user).where(eq(user.id, userId)).get();
  if (!target) {
    setResponseStatus(404);
    throw new Error(m.users_not_found());
  }
  if (target.role === "admin" && !caller.permissions.includes("admin")) {
    setResponseStatus(403);
    throw new Error(m.users_admin_only());
  }
}

export const getUsers = createServerFn({ method: "GET" })
  .middleware([requireManageUsers])
  .handler(() => listUsers(db));

/** Creates an account (invite-only: the creator hands over the temporary password). */
export const createUser = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(CreateUserSchema)
  .handler(async ({ data }) => {
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
    assertCanManage(context, data.userId);
    await updateAccount(data.userId, { role: data.role });
    return { ok: true };
  });

/** A user's own permissions (null: the defaults). */
export const setUserPermissionList = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(SetPermissionsSchema)
  .handler(({ data, context }) => {
    assertCanManage(context, data.userId);
    setUserPermissions(db, data.userId, data.permissions);
    return { ok: true };
  });

/** Banning signs the user out everywhere and blocks sign-in until unbanned. */
export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(SetBannedSchema)
  .handler(async ({ data, context }) => {
    assertCanManage(context, data.userId);
    if (data.banned) await banAccount(data.userId);
    else await unbanAccount(data.userId);
    return { ok: true };
  });

/** Deletes the account with its requests and issues. */
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(UserIdSchema)
  .handler(async ({ data, context }) => {
    assertCanManage(context, data.userId);
    await removeAccount(data.userId);
    return { ok: true };
  });

/** Per-user request limits (null: the global ones from Settings → Users). */
export const setUserLimits = createServerFn({ method: "POST" })
  .middleware([requireManageUsers])
  .validator(SetRequestLimitsSchema)
  .handler(({ data, context }) => {
    assertCanManage(context, data.userId);
    setUserRequestLimits(db, data.userId, data.requestLimits);
    return { ok: true };
  });

const ServerSchema = v.object({ server: v.picklist(MEDIA_SERVERS) });

/** A media server's accounts, with whether each already has a Storyrr account. User managers. */
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
      })),
    };
  });

/**
 * Creates Storyrr accounts for media-server accounts, linked to them, with the
 * default permissions. They sign in with their media-server password.
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
    for (const account of accounts.value.filter((a) => data.keys.includes(a.key))) {
      if (linkedUserId(db, data.server, account.key)) continue;
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
    return { imported };
  });

/** A media server's accounts, keyed like sign-in links (ABS id, Kavita lowercased username). */
async function serverAccounts(server: MediaServer) {
  if (server === "audiobookshelf") {
    const abs = await services.audiobookshelf();
    if (!abs) return fail("not_configured", "Audiobookshelf is not configured");
    const result = await abs.users();
    if (!result.ok) return result;
    return ok(result.value.map((u) => ({ key: u.id, name: u.username, email: u.email ?? null })));
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
