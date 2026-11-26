import "@tanstack/react-start/server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import type { AppDatabase } from "#/server/db/client";
import * as schema from "#/server/db/schema";
import type { MediaServerSignInInput } from "#/lib/media-server-login";

import { CLIENT_IP_HEADER } from "./client-ip";
import { linkOnAppUrl, requestOrigin } from "./origins";

import type { MediaServerResolution } from "./media-server";
import { mediaServerSignInPlugin } from "./media-server-plugin";

export type AuthHooks = {
  /** Emails a password reset link (Storyrr sends it through the Email notification agent). */
  sendResetPassword?: (data: { email: string; name: string; url: string }) => Promise<void>;
  /** Sign in with Audiobookshelf / Kavita accounts. */
  resolveMediaServerSignIn?: (input: MediaServerSignInInput) => Promise<MediaServerResolution>;
};

export type AuthConfig = {
  secret: string;
  /** The application URL (an origin), or null when not set yet: for links only. */
  appUrl: () => Promise<string | null>;
};

/**
 * Like Seerr, Storyrr works at every address it's reached at (its LAN IP over
 * http, a tunnel's domain over https): better-auth gets no `baseURL`, so it
 * takes each request's own origin, and only that origin (plus the application
 * URL) is trusted for sign-ins, which keeps the CSRF origin check. Links that
 * leave the request (the password reset email) use the application URL, never
 * the request's Host, which anyone can set. Cookies are marked Secure per
 * request, on HTTPS only (`secureCookiesOnHttps`, in `src/server.ts`).
 */
export function createAuth(database: AppDatabase, config: AuthConfig, hooks: AuthHooks = {}) {
  const { sendResetPassword, resolveMediaServerSignIn } = hooks;
  const sendResetLink = async (user: { email: string; name: string }, url: string) => {
    const appUrl = await config.appUrl();
    if (!appUrl) {
      console.warn("[auth] password reset requested, but the application URL isn't set");
      return;
    }
    await sendResetPassword?.({
      email: user.email,
      name: user.name,
      url: linkOnAppUrl(url, appUrl),
    });
  };
  return betterAuth({
    secret: config.secret,
    trustedOrigins: async (request) => {
      const appUrl = await config.appUrl();
      const own = request ? requestOrigin(request) : null;
      return [own, appUrl].filter((origin): origin is string => Boolean(origin));
    },
    advanced: {
      // The request's host and protocol as the reverse proxy / tunnel saw them.
      trustedProxyHeaders: true,
      // Decided per request instead (http on the LAN, https through a tunnel).
      useSecureCookies: false,
      // On everywhere, tests included (better-auth turns it off under test by default).
      disableOriginCheck: false,
      // Rate limits count per visitor address, which Storyrr sets itself on each
      // request (client-ip.ts): better-auth's default, X-Forwarded-For, can be forged.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    logger: {
      log: (level, message, ...args) => {
        // Expected: Storyrr gives better-auth no base URL on purpose (see above).
        if (message.includes("Base URL is not set")) return;
        const write =
          level === "error" ? console.error : level === "warn" ? console.warn : console.log;
        write(`[better-auth] ${message}`, ...args);
      },
    },
    database: drizzleAdapter(database, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // Invite-only: accounts are created by an admin (or by the setup wizard), never by public sign-up.
      disableSignUp: true,
      // "Forgot password?": the link is valid for an hour and works once.
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      ...(sendResetPassword
        ? {
            sendResetPassword: ({
              user,
              url,
            }: {
              user: { email: string; name: string };
              url: string;
            }) => sendResetLink(user, url),
          }
        : {}),
    },
    // tanstackStartCookies must stay the last plugin.
    plugins: [
      admin(),
      ...(resolveMediaServerSignIn ? [mediaServerSignInPlugin(resolveMediaServerSignIn)] : []),
      tanstackStartCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
