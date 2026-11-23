import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";

import { auth } from "./index";

/**
 * Server function middleware: rejects anonymous calls with 401 and exposes the
 * session as `context.session`. Attach it to every server function that reads
 * or writes private data (route guards don't protect server functions).
 */
export const requireUser = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session) {
    setResponseStatus(401);
    throw new Error("Unauthorized");
  }
  return next({ context: { session } });
});

/** Like `requireUser`, and rejects non-admins with 403. */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireUser])
  .server(async ({ next, context }) => {
    if (context.session.user.role !== "admin") {
      setResponseStatus(403);
      throw new Error("Forbidden");
    }
    return next();
  });
