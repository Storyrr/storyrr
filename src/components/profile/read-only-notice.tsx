import { LockIcon } from "lucide-react";

import { Alert, AlertDescription } from "#/components/ui/alert";
import { m } from "#/paraglide/messages.js";

const messages = {
  owner: m.users_owner_protected,
  admin_only: m.users_admin_only,
  outranked: m.users_outranked,
} as const;

/** Why the caller can't change this account: the Owner's, an admin's, or one with more permissions. */
export function ReadOnlyNotice({ account }: { account: { lock: keyof typeof messages | null } }) {
  if (!account.lock) return null;
  return (
    <Alert>
      <LockIcon />
      <AlertDescription>{messages[account.lock]()}</AlertDescription>
    </Alert>
  );
}
