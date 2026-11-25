import "@tanstack/react-start/server-only";

import type { Auth } from "#/server/auth/config";
import type { AppDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";
import type { SetupInput } from "#/lib/schemas/auth";

/** Setup is complete once any account exists: the first one is always the admin. */
export async function isSetupComplete(db: AppDatabase): Promise<boolean> {
  const rows = await db.select({ id: user.id }).from(user).limit(1);
  return rows.length > 0;
}

export type CreateInitialAdminResult =
  | { status: "created"; userId: string }
  | { status: "already_done" };

// One process serves the app, so serializing here is enough to keep two
// concurrent wizard submissions from both creating an admin.
let queue: Promise<unknown> = Promise.resolve();

/** Creates the first admin account, unless setup has already been completed. */
export function createInitialAdmin(
  db: AppDatabase,
  auth: Auth,
  input: Pick<SetupInput, "name" | "email" | "password">,
): Promise<CreateInitialAdminResult> {
  const run = async (): Promise<CreateInitialAdminResult> => {
    if (await isSetupComplete(db)) return { status: "already_done" };
    // Called without request headers, the admin plugin skips its session check: safe
    // here only because no account exists yet.
    const { user: created } = await auth.api.createUser({
      body: { name: input.name, email: input.email, password: input.password, role: "admin" },
    });
    return { status: "created", userId: created.id };
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
