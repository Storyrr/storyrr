import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { TabNav } from "#/components/layout/tab-nav";

import { can } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";

/** Settings, admin only: Seerr-like tabs over one page per area. */
export const Route = createFileRoute("/_authed/settings")({
  beforeLoad: ({ context, location }) => {
    if (!can(context.user, "manage_settings")) throw redirect({ to: "/" });
    if (location.pathname.replace(/\/+$/, "") === "/settings")
      throw redirect({ to: "/settings/general" });
  },
  component: SettingsLayout,
});

const TABS = [
  { to: "/settings/general", label: m.settings_tab_general },
  { to: "/settings/users", label: m.settings_tab_users },
  { to: "/settings/services", label: m.settings_tab_services },
  { to: "/settings/audiobookshelf", label: m.service_audiobookshelf },
  { to: "/settings/kavita", label: m.service_kavita },
  { to: "/settings/komga", label: m.service_komga },
  { to: "/settings/jellyfin", label: m.service_jellyfin },
  { to: "/settings/network", label: m.settings_tab_network },
  { to: "/settings/notifications", label: m.settings_tab_notifications },
  { to: "/settings/metadata", label: m.settings_tab_metadata },
  { to: "/settings/jobs", label: m.settings_tab_jobs },
  { to: "/settings/about", label: m.settings_tab_about },
] as const;

function SettingsLayout() {
  return (
    <div className="flex flex-col gap-8">
      <TabNav label={m.nav_settings()} tabs={TABS}>
        <Outlet />
      </TabNav>
    </div>
  );
}
