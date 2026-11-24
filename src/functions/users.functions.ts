import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";

import {
  CreateUserSchema,
  SetAutoApproveSchema,
  SetBannedSchema,
  SetRequestLimitsSchema,
  SetRoleSchema,
  UserIdSchema,
} from "#/lib/schemas/users";
import { m } from "#/paraglide/messages.js";
import { auth } from "#/server/auth";
import { requireAdmin } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { setUserRequestLimits } from "#/server/requests/quota";
import { listUsers, setAutoApprove } from "#/server/users";

/** Admins can't lock themselves out: no demoting, banning or deleting one's own account. */
function refuseSelf(userId: string, adminId: string) {
  if (userId === adminId) {
    setResponseStatus(409);
    throw new Error(m.users_not_yourself());
  }
}

export const getUsers = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(() => listUsers(db));

/** Creates an account (invite-only: the admin hands over the temporary password). */
export const createUser = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(CreateUserSchema)
  .handler(async ({ data }) => {
    const { user } = await auth.api.createUser({
      body: { name: data.name, email: data.email, password: data.password, role: data.role },
      headers: getRequestHeaders(),
    });
    if (data.autoApprove) setAutoApprove(db, user.id, true);
    return { id: user.id };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(SetRoleSchema)
  .handler(async ({ data, context }) => {
    refuseSelf(data.userId, context.session.user.id);
    await auth.api.setRole({
      body: { userId: data.userId, role: data.role },
      headers: getRequestHeaders(),
    });
    return { ok: true };
  });

export const setUserAutoApprove = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(SetAutoApproveSchema)
  .handler(({ data }) => {
    setAutoApprove(db, data.userId, data.autoApprove);
    return { ok: true };
  });

/** Banning signs the user out everywhere and blocks sign-in until unbanned. */
export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(SetBannedSchema)
  .handler(async ({ data, context }) => {
    refuseSelf(data.userId, context.session.user.id);
    const headers = getRequestHeaders();
    if (data.banned) await auth.api.banUser({ body: { userId: data.userId }, headers });
    else await auth.api.unbanUser({ body: { userId: data.userId }, headers });
    return { ok: true };
  });

/** Deletes the account with its requests and issues. */
export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(UserIdSchema)
  .handler(async ({ data, context }) => {
    refuseSelf(data.userId, context.session.user.id);
    await auth.api.removeUser({ body: { userId: data.userId }, headers: getRequestHeaders() });
    return { ok: true };
  });

/** Per-user request limits (null: the global ones from Settings → Users). Admin only. */
export const setUserLimits = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(SetRequestLimitsSchema)
  .handler(({ data }) => {
    setUserRequestLimits(db, data.userId, data.requestLimits);
    return { ok: true };
  });
