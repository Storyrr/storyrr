import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AccountSettingsLayout } from "#/components/profile/account-settings-layout";
import { accountQuery } from "#/lib/queries/profile";

/** The signed-in user's own settings. */
export const Route = createFileRoute("/_authed/profile/settings")({
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/+$/, "") === "/profile/settings")
      throw redirect({ to: "/profile/settings/general" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(accountQuery()),
  component: () => (
    <AccountSettingsLayout basePath="/profile/settings">
      <Outlet />
    </AccountSettingsLayout>
  ),
});
