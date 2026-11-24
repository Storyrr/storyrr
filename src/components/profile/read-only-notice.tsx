import { LockIcon } from "lucide-react";

import { Alert, AlertDescription } from "#/components/ui/alert";
import { m } from "#/paraglide/messages.js";

/** Why the caller can't change this account: it's the Owner's, or an administrator's. */
export function ReadOnlyNotice({ account }: { account: { isOwner: boolean } }) {
  return (
    <Alert>
      <LockIcon />
      <AlertDescription>
        {account.isOwner ? m.users_owner_protected() : m.users_admin_only()}
      </AlertDescription>
    </Alert>
  );
}
