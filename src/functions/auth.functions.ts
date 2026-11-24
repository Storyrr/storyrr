import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { SetupSchema } from "#/lib/schemas/auth";
import { m } from "#/paraglide/messages.js";
import { auth } from "#/server/auth";
import { db } from "#/server/db";
import { userLocale } from "#/server/profile";
import { isAutoApproved } from "#/server/requests/queries";
import { createInitialAdmin, isSetupComplete } from "#/server/setup";
import { getEnv } from "#/server/env";
import { APP_VERSION } from "#/server/version";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  /** Requests skip approval (admins, or the per-user flag). */
  autoApproved: boolean;
  /** Display language picked in their settings; null follows the browser. */
  locale: string | null;
};

/**
 * Public: whether the setup wizard has run, and the caller's own user (or null).
 * Exposes nothing about other accounts.
 */
export const getAuthState = createServerFn({ method: "GET" }).handler(async () => {
  const [setupComplete, session] = await Promise.all([
    isSetupComplete(db),
    auth.api.getSession({ headers: getRequestHeaders() }),
  ]);
  const user: SessionUser | null = session
    ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        isAdmin: session.user.role === "admin",
        autoApproved: isAutoApproved(db, session.user.id, session.user.role === "admin"),
        locale: userLocale(db, session.user.id),
      }
    : null;
  // The public URL is no secret: link previews need absolute URLs (og:image, og:url).
  return { setupComplete, user, version: APP_VERSION, appUrl: getEnv().BETTER_AUTH_URL };
});

/**
 * Public, but only works once: creates the first (admin) account while the
 * database has no user, then signs it in.
 */
export const completeSetup = createServerFn({ method: "POST" })
  .validator(SetupSchema)
  .handler(async ({ data }) => {
    const result = await createInitialAdmin(db, auth, data);
    if (result.status === "already_done") throw new Error(m.setup_already_done());
    await auth.api.signInEmail({
      body: { email: data.email, password: data.password },
      headers: getRequestHeaders(),
    });
    return { ok: true };
  });
