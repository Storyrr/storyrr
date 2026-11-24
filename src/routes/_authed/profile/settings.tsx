import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { UserIcon } from "lucide-react";

import { TabNav } from "#/components/layout/tab-nav";
import { ProfileHeader } from "#/components/profile/profile-header";
import { accountQuery } from "#/lib/queries/profile";
import { m } from "#/paraglide/messages.js";

/** The signed-in user's own settings (Seerr's user settings), one tab per area. */
export const Route = createFileRoute("/_authed/profile/settings")({
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/+$/, "") === "/profile/settings")
      throw redirect({ to: "/profile/settings/general" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(accountQuery()),
  component: ProfileSettingsLayout,
});

const TABS = [
  { to: "/profile/settings/general", label: m.settings_tab_general },
  { to: "/profile/settings/password", label: m.profile_tab_password },
  { to: "/profile/settings/permissions", label: m.profile_tab_permissions },
] as const;

function ProfileSettingsLayout() {
  const { user } = Route.useRouteContext();
  const { data: account } = useSuspenseQuery(accountQuery());
  return (
    <div className="flex flex-col gap-8">
      <ProfileHeader
        user={user}
        createdAt={account.createdAt}
        link={{
          to: "/profile",
          label: m.profile_view(),
          icon: <UserIcon data-icon="inline-start" />,
        }}
      />
      <TabNav label={m.nav_settings()} tabs={TABS} />
      <Outlet />
    </div>
  );
}
