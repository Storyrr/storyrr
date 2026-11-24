import { createFileRoute } from "@tanstack/react-router";

import { ChaptarrSettings } from "#/components/settings/chaptarr-settings";
import { serviceSettingsQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/settings/services")({
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceSettingsQuery()),
  head: () => ({ meta: [{ title: `${m.settings_tab_services()} · ${m.app_name()}` }] }),
  component: ChaptarrSettings,
});
