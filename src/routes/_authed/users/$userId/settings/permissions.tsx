import { createFileRoute } from "@tanstack/react-router";

import { PermissionSettings } from "#/components/profile/permission-settings";

export const Route = createFileRoute("/_authed/users/$userId/settings/permissions")({
  component: function UserTab() {
    const { userId } = Route.useParams();
    return <PermissionSettings userId={userId} />;
  },
});
