import "@tanstack/react-start/server-only";

import { auth } from "./index";

/*
 * Account changes made on someone else's behalf, through better-auth's
 * internal adapter (what its admin endpoints do once they have checked the
 * caller). Storyrr checks its own permissions first (`manage_users`), so a
 * user manager who isn't an admin can use them too; the admin endpoints would
 * require the admin role.
 */

async function context() {
  return auth.$context;
}

/** Signs the user out everywhere and blocks sign-in until unbanned. */
export async function banAccount(userId: string): Promise<void> {
  const ctx = await context();
  await ctx.internalAdapter.updateUser(userId, { banned: true, updatedAt: new Date() });
  await ctx.internalAdapter.deleteUserSessions(userId);
}

export async function unbanAccount(userId: string): Promise<void> {
  const ctx = await context();
  await ctx.internalAdapter.updateUser(userId, {
    banned: false,
    banReason: null,
    banExpires: null,
    updatedAt: new Date(),
  });
}

/** Deletes the account (sessions, credentials, and by cascade its requests and issues). */
export async function removeAccount(userId: string): Promise<void> {
  const ctx = await context();
  await ctx.internalAdapter.deleteUserSessions(userId);
  await ctx.internalAdapter.deleteUser(userId);
}

/**
 * Sets a new password, creating the email/password credential if the account
 * had none, and ends the account's sessions: whoever knew the old password
 * (the reason for most resets) is signed out.
 */
export async function setAccountPassword(userId: string, password: string): Promise<void> {
  const ctx = await context();
  const hashed = await ctx.password.hash(password);
  if (await ctx.internalAdapter.findCredentialAccount(userId)) {
    await ctx.internalAdapter.updatePassword(userId, hashed);
  } else {
    await ctx.internalAdapter.createAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: hashed,
    });
  }
  await ctx.internalAdapter.deleteUserSessions(userId);
}

export async function updateAccount(
  userId: string,
  data: { name?: string; email?: string; role?: "admin" | "user" },
): Promise<void> {
  const ctx = await context();
  await ctx.internalAdapter.updateUser(userId, { ...data, updatedAt: new Date() });
}
