import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { TabNav } from "#/components/layout/tab-nav";

import { m } from "#/paraglide/messages.js";

/** Settings, admin only: Seerr-like tabs over one page per area. */
export const Route = createFileRoute("/_authed/settings")({
  beforeLoad: ({ context, location }) => {
    if (!context.user.isAdmin) throw redirect({ to: "/" });
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
] as const;

function SettingsLayout() {
  return (
    <div className="flex flex-col gap-8">
      <TabNav label={m.nav_settings()} tabs={TABS} />
      <Outlet />
    </div>
  );
}
