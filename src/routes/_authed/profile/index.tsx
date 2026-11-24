import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";

import { ProfileHeader } from "#/components/profile/profile-header";
import { RequestRow } from "#/components/requests/request-row";
import { Card, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { accountQuery } from "#/lib/queries/profile";
import { requestsQuery } from "#/lib/queries/requests";
import { m } from "#/paraglide/messages.js";

const RECENT = 10;

export const Route = createFileRoute("/_authed/profile/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(accountQuery()),
      context.queryClient.ensureQueryData(requestsQuery("mine", "all")),
    ]),
  head: () => ({ meta: [{ title: `${m.nav_profile()} · ${m.app_name()}` }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const { data: account } = useSuspenseQuery(accountQuery());
  const { data: requests } = useSuspenseQuery(requestsQuery("mine", "all"));
  const stats = [
    { label: m.profile_stat_total(), value: account.requests.total },
    { label: m.settings_chaptarr_audiobooks(), value: account.requests.audiobook },
    { label: m.settings_chaptarr_ebooks(), value: account.requests.ebook },
    { label: m.profile_stat_available(), value: account.requests.available },
  ];

  return (
    <div className="flex flex-col gap-10">
      <ProfileHeader
        user={user}
        createdAt={account.createdAt}
        link={{
          to: "/profile/settings",
          label: m.profile_edit_settings(),
          icon: <SettingsIcon data-icon="inline-start" />,
        }}
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <li key={stat.label}>
            <Card>
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{stat.value}</CardTitle>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ul>
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold">{m.profile_recent_requests()}</h2>
          {requests.length > RECENT ? (
            <Link to="/requests" search={{ scope: "mine" }} className="text-sm hover:underline">
              {m.profile_all_requests()}
            </Link>
          ) : null}
        </div>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.requests_empty_description()}</p>
        ) : (
          <ul>
            {requests.slice(0, RECENT).map((request) => (
              <RequestRow key={request.id} request={request} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
