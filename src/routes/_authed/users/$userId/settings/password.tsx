import { createFileRoute } from "@tanstack/react-router";

import { PasswordSettings } from "#/components/profile/password-settings";

export const Route = createFileRoute("/_authed/users/$userId/settings/password")({
  component: function UserTab() {
    const { userId } = Route.useParams();
    return <PasswordSettings userId={userId} />;
  },
});
