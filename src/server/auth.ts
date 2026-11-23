import "@tanstack/react-start/server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "#/server/db";
import * as schema from "#/server/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    // Invite-only: accounts are created by an admin (or by the setup wizard), never by public sign-up.
    disableSignUp: true,
  },
  // tanstackStartCookies must stay the last plugin.
  plugins: [admin(), tanstackStartCookies()],
});
