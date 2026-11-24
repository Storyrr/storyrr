import { createFileRoute } from "@tanstack/react-router";

import { PasswordSettings } from "#/components/profile/password-settings";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/profile/settings/password")({
  head: () => ({ meta: [{ title: `${m.profile_tab_password()} · ${m.app_name()}` }] }),
  component: PasswordSettings,
});
