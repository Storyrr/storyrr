import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { can } from "#/lib/permissions";
import { AccountSettingsLayout } from "#/components/profile/account-settings-layout";
import { accountQuery } from "#/lib/queries/profile";
import { userSettingsQuery } from "#/lib/queries/settings";

/** An admin editing another user's settings (Users → Edit). */
export const Route = createFileRoute("/_authed/users/$userId/settings")({
  beforeLoad: ({ context, location, params }) => {
    if (!can(context.user, "manage_users")) throw redirect({ to: "/" });
    // One's own account has its own settings page (current password, language applied here).
    if (params.userId === context.user.id) throw redirect({ to: "/profile/settings/general" });
    if (location.pathname.replace(/\/+$/, "") === `/users/${params.userId}/settings`)
      throw redirect({ to: "/users/$userId/settings/general", params });
  },
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(accountQuery(params.userId)),
      context.queryClient.ensureQueryData(userSettingsQuery()),
    ]),
  component: UserSettingsLayout,
});

function UserSettingsLayout() {
  const { userId } = Route.useParams();
  return (
    <AccountSettingsLayout userId={userId} basePath={`/users/${userId}/settings`}>
      <Outlet />
    </AccountSettingsLayout>
  );
}
