import { createFileRoute } from "@tanstack/react-router";

import { PermissionSettings } from "#/components/profile/permission-settings";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/profile/settings/permissions")({
  head: () => ({ meta: [{ title: `${m.profile_tab_permissions()} · ${m.app_name()}` }] }),
  component: PermissionSettings,
});
