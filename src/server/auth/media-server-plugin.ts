import "@tanstack/react-start/server-only";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

import { MediaServerSignInSchema, type MediaServerSignInInput } from "#/lib/media-server-login";

import type { MediaServerResolution } from "./media-server";

/**
 * better-auth plugin: POST /api/auth/sign-in/media-server signs in with an
 * Audiobookshelf or Kavita account (see `resolveMediaServerSignIn`), then opens
 * a normal Storyrr session. Bans apply (the admin plugin's session hook).
 */
export const mediaServerSignInPlugin = (
  resolve: (input: MediaServerSignInInput) => Promise<MediaServerResolution>,
) =>
  ({
    id: "storyrr-media-server-sign-in",
    endpoints: {
      signInMediaServer: createAuthEndpoint(
        "/sign-in/media-server",
        { method: "POST", body: MediaServerSignInSchema },
        async (ctx) => {
          const result = await resolve(ctx.body);
          if (!result.ok) {
            throw new APIError("UNAUTHORIZED", {
              code: result.error.toUpperCase(),
              message: result.error,
            });
          }
          let userId: string;
          if ("userId" in result) {
            userId = result.userId;
          } else {
            const created = await ctx.context.internalAdapter.createUser(
              { ...result.create, emailVerified: false, role: "user" },
              { method: "media-server" },
            );
            result.link(created.id);
            userId = created.id;
          }
          const found = await ctx.context.internalAdapter.findUserById(userId);
          if (!found) throw new APIError("UNAUTHORIZED", { message: "no_account" });
          const session = await ctx.context.internalAdapter.createSession(found.id);
          await setSessionCookie(ctx, { session, user: found });
          return ctx.json({ user: { id: found.id } });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
