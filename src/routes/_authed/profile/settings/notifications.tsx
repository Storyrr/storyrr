import { createFileRoute } from "@tanstack/react-router";

import { NotificationSettings } from "#/components/profile/notification-settings";
import { myNotificationsQuery } from "#/lib/queries/notifications";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/profile/settings/notifications")({
  loader: ({ context }) => context.queryClient.ensureQueryData(myNotificationsQuery()),
  head: () => ({ meta: [{ title: `${m.settings_tab_notifications()} · ${m.app_name()}` }] }),
  component: NotificationSettings,
});
