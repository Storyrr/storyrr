import { createFileRoute } from "@tanstack/react-router";

import { UserSettingsForm } from "#/components/settings/user-settings-form";
import { userSettingsQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/settings/users")({
  loader: ({ context }) => context.queryClient.ensureQueryData(userSettingsQuery()),
  head: () => ({ meta: [{ title: `${m.settings_tab_users()} · ${m.app_name()}` }] }),
  component: UserSettingsForm,
});
