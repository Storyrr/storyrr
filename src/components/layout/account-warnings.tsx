import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import type { SessionUser } from "#/functions/auth.functions";
import { isPlaceholderEmail } from "#/lib/emails";
import { m } from "#/paraglide/messages.js";

/** Seerr's "profile incomplete" notice: accounts created from a media server without an email. */
export function AccountWarnings({ user }: { user: SessionUser }) {
  if (!isPlaceholderEmail(user.email)) return null;
  return (
    <Alert className="mb-6">
      <TriangleAlertIcon />
      <AlertTitle>{m.account_warning_email_title()}</AlertTitle>
      <AlertDescription>
        <p>
          {m.account_warning_email_description()}{" "}
          <Link to="/profile/settings/general" className="font-medium underline">
            {m.account_warning_email_action()}
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}
