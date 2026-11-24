import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { MEDIA_SERVERS, type MediaServer } from "#/lib/media-server-login";
import type { Permission } from "#/lib/permissions";
import { SetupSchema } from "#/lib/schemas/auth";
import { m } from "#/paraglide/messages.js";
import { auth } from "#/server/auth";
import { passwordResetAvailable } from "#/server/auth/password-reset";
import { getNetworkSettings } from "#/server/network";
import { mediaServerSignIn } from "#/server/settings/definitions";
import { db } from "#/server/db";
import { userLocale } from "#/server/profile";
import { permissionsOf } from "#/server/permissions";
import { settings } from "#/server/settings";
import { createInitialAdmin, isSetupComplete } from "#/server/setup";
import { getEnv } from "#/server/env";
import { APP_VERSION } from "#/server/version";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  /** Effective permissions, for showing what the user can do (the server re-checks). */
  permissions: Permission[];
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
        permissions: await permissionsOf({ db, settings }, session.user),
        locale: userLocale(db, session.user.id),
      }
    : null;
  // The public URL is no secret: link previews need absolute URLs (og:image, og:url).
  return {
    setupComplete,
    user,
    version: APP_VERSION,
    appUrl: getEnv().BETTER_AUTH_URL,
    /** "Forgot password?" works (email is set up). */
    passwordReset: await passwordResetAvailable(),
    /** Media servers whose accounts can sign in. */
    mediaServerSignIn: await enabledMediaServerSignIns(),
    /** Covers go through Storyrr's image cache (signed-in pages only). */
    imageCache: session ? (await getNetworkSettings(settings)).imageCache : false,
  };
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

async function enabledMediaServerSignIns(): Promise<MediaServer[]> {
  const config = await settings.get(mediaServerSignIn);
  return MEDIA_SERVERS.filter((server) => config?.[server].enabled);
}
