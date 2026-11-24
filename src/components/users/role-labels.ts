import { m } from "#/paraglide/messages.js";

/** An account's role as shown: Owner (the setup account), Administrator or User. */
export function roleLabel(account: { isAdmin: boolean; isOwner: boolean }): string {
  if (account.isOwner) return m.role_owner();
  return account.isAdmin ? m.role_admin() : m.role_user();
}
