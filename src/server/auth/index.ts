import "@tanstack/react-start/server-only";

import { db } from "#/server/db";
import { getEnv } from "#/server/env";

import { createAuth } from "./config";
import { resolveMediaServerSignIn } from "./media-server";
import { sendPasswordResetEmail } from "./password-reset";
import { services } from "#/server/services";
import { settings } from "#/server/settings";

export type { Auth } from "./config";

/** The app's better-auth instance (also what the better-auth CLI reads to generate the schema). */
export const auth = createAuth(db, getEnv(), {
  sendResetPassword: sendPasswordResetEmail,
  resolveMediaServerSignIn: (input) => resolveMediaServerSignIn({ db, services, settings }, input),
});
