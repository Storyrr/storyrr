import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRightCircleIcon, SettingsIcon } from "lucide-react";

import { MediaRow, MediaRowItem } from "#/components/media/media-row";
import { ProfileHeader } from "#/components/profile/profile-header";
import { RequestCard } from "#/components/requests/request-card";
import { Card, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { accountQuery } from "#/lib/queries/profile";
import { requestsQuery } from "#/lib/queries/requests";
import type { RequestQuota } from "#/lib/requests";
import { useImageUrl } from "#/lib/images";
import { m } from "#/paraglide/messages.js";

const RECENT = 20;

export const Route = createFileRoute("/_authed/profile/")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(accountQuery()),
      context.queryClient.ensureQueryData(
        requestsQuery({ scope: "mine", filter: "all", sort: "added" }),
      ),
    ]),
  head: () => ({ meta: [{ title: `${m.nav_profile()} · ${m.app_name()}` }] }),
  component: ProfilePage,
});

/** "Unlimited", or what's left like Seerr ("3 / 5", for the next 7 days). */
function QuotaCard({ label, quota }: { label: string; quota: RequestQuota }) {
  const limited = quota.limit !== null && quota.remaining !== null;
  return (
    <Card>
      <CardHeader>
        <CardDescription className="font-medium text-foreground">{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {limited ? `${quota.remaining} / ${quota.limit}` : m.settings_limit_unlimited()}
        </CardTitle>
        {limited ? (
          <CardDescription>{m.profile_quota_period({ days: quota.days })}</CardDescription>
        ) : null}
      </CardHeader>
    </Card>
  );
}

function ProfilePage() {
  const imageUrl = useImageUrl();
  const { data: account } = useSuspenseQuery(accountQuery());
  const { data: all } = useSuspenseQuery(
    requestsQuery({ scope: "mine", filter: "all", sort: "added" }),
  );
  // Newest first (the requests page puts pending ones on top instead).
  const recent = all
    .toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT);
  const backdrop = recent.find((request) => request.media.coverUrl)?.media.coverUrl;

  return (
    <div className="relative flex flex-col gap-10">
      {backdrop ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-4 -top-6 -z-10 h-80 overflow-hidden md:-inset-x-8"
        >
          <img
            src={imageUrl(backdrop)}
            alt=""
            className="size-full scale-110 object-cover opacity-30 blur-md"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 to-background" />
        </div>
      ) : null}
      <ProfileHeader
        account={account}
        link={{
          to: "/profile/settings",
          label: m.profile_edit_settings(),
          icon: <SettingsIcon data-icon="inline-start" />,
        }}
      />
      <ul className="grid gap-4 md:grid-cols-3">
        <li>
          <Card>
            <CardHeader>
              <CardDescription className="font-medium text-foreground">
                {m.profile_stat_total()}
              </CardDescription>
              <CardTitle className="text-3xl tabular-nums">{account.requests.total}</CardTitle>
            </CardHeader>
          </Card>
        </li>
        <li>
          <QuotaCard label={m.profile_stat_audiobooks()} quota={account.quotas.audiobook} />
        </li>
        <li>
          <QuotaCard label={m.profile_stat_ebooks()} quota={account.quotas.ebook} />
        </li>
      </ul>
      <MediaRow
        title={m.profile_recent_requests()}
        action={
          <Link
            to="/requests"
            search={{ scope: "mine" }}
            aria-label={m.profile_all_requests()}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowRightCircleIcon className="size-5" />
          </Link>
        }
      >
        {recent.length === 0 ? (
          <li className="text-sm text-muted-foreground">{m.requests_empty_description()}</li>
        ) : null}
        {recent.map((request) => (
          <MediaRowItem key={request.id} wide>
            <RequestCard request={request} />
          </MediaRowItem>
        ))}
      </MediaRow>
    </div>
  );
}
