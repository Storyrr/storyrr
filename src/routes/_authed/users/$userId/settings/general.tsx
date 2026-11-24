import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettings } from "#/components/profile/general-settings";

export const Route = createFileRoute("/_authed/users/$userId/settings/general")({
  component: function UserTab() {
    const { userId } = Route.useParams();
    return <GeneralSettings userId={userId} />;
  },
});
