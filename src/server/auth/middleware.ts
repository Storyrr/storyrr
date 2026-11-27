import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";

import type { Permission } from "#/lib/permissions";
import { db } from "#/server/db";
import { permissionsOf } from "#/server/permissions";
import { settings } from "#/server/settings";

import { auth } from "./index";
import { UNAUTHORIZED } from "#/lib/auth-errors";

/**
 * Server function middleware: rejects anonymous calls with 401 and exposes the
 * session as `context.session` and the user's effective permissions as
 * `context.permissions`. Attach it to every server function that reads or
 * writes private data (route guards don't protect server functions).
 */
export const requireUser = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session) {
    setResponseStatus(401);
    throw new Error(UNAUTHORIZED);
  }
  const permissions = await permissionsOf({ db, settings }, session.user);
  return next({ context: { session, permissions } });
});

/** Like `requireUser`, and rejects (403) users without one of the given permissions. */
export const requirePermission = (...required: Permission[]) =>
  createMiddleware({ type: "function" })
    .middleware([requireUser])
    .server(async ({ next, context }) => {
      if (!required.some((p) => context.permissions.includes(p))) {
        setResponseStatus(403);
        throw new Error("Forbidden");
      }
      return next();
    });

/** Admins only (the better-auth role). */
export const requireAdmin = requirePermission("admin");
