import "@tanstack/react-start/server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import type { AppDatabase } from "#/server/db/client";
import * as schema from "#/server/db/schema";
import type { Env } from "#/server/env";

export function createAuth(
  database: AppDatabase,
  env: Pick<Env, "BETTER_AUTH_URL" | "BETTER_AUTH_SECRET">,
) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // Invite-only: accounts are created by an admin (or by the setup wizard), never by public sign-up.
      disableSignUp: true,
    },
    // tanstackStartCookies must stay the last plugin.
    plugins: [admin(), tanstackStartCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
