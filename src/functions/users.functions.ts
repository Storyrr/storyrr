import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import {
  CreateUserSchema,
  SetBannedSchema,
  SetPermissionsSchema,
  SetRequestLimitsSchema,
  SetRoleSchema,
  UserIdSchema,
} from "#/lib/schemas/users";
import { m } from "#/paraglide/messages.js";
import { auth } from "#/server/auth";
import { banAccount, removeAccount, unbanAccount, updateAccount } from "#/server/auth/accounts";
import { requireAdmin, requirePermission } from "#/server/auth/middleware";
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
