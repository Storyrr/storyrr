import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettings } from "#/components/profile/general-settings";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/profile/settings/general")({
  head: () => ({ meta: [{ title: `${m.settings_tab_general()} · ${m.app_name()}` }] }),
  component: GeneralSettings,
});
