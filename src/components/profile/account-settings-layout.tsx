import { useSuspenseQuery } from "@tanstack/react-query";
import { UserIcon } from "lucide-react";

import { TabNav } from "#/components/layout/tab-nav";
import { accountQuery } from "#/lib/queries/profile";
import { m } from "#/paraglide/messages.js";

import { ProfileHeader } from "./profile-header";

/**
 * Seerr's user settings: the account header, then General / Password /
 * Permissions tabs under `basePath` (the caller's own, or a user's for admins).
 */
export function AccountSettingsLayout({
  userId,
  basePath,
  children,
}: {
  userId?: string;
  basePath: string;
  children: React.ReactNode;
}) {
  const { data: account } = useSuspenseQuery(accountQuery(userId));
  const tabs = [
    { to: `${basePath}/general`, label: m.settings_tab_general },
    { to: `${basePath}/password`, label: m.profile_tab_password },
    { to: `${basePath}/permissions`, label: m.profile_tab_permissions },
    // Personal channels are set by each user for themselves.
    ...(account.self
      ? [{ to: `${basePath}/notifications`, label: m.settings_tab_notifications }]
      : []),
  ];
  return (
    <div className="flex flex-col gap-8">
      <ProfileHeader
        account={account}
        link={
          account.self
            ? {
                to: "/profile",
                label: m.profile_view(),
                icon: <UserIcon data-icon="inline-start" />,
              }
            : undefined
        }
      />
      <TabNav label={m.nav_settings()} tabs={tabs}>
        {children}
      </TabNav>
    </div>
  );
}
