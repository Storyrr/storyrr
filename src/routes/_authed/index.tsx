import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import { Cover } from "#/components/media/cover";
import { MediaRow, MediaRowItem } from "#/components/media/media-row";
import { RequestCard } from "#/components/requests/request-card";
import { TrendingRow } from "#/components/media/trending-row";
import { Skeleton } from "#/components/ui/skeleton";
import { formatList } from "#/lib/format";
import { discoverRequestsQuery } from "#/lib/queries/requests";
import { m } from "#/paraglide/messages.js";

/** Discover (Seerr-like): what's popular, the latest requests, what just arrived. */
export const Route = createFileRoute("/_authed/")({
  head: () => ({ meta: [{ title: `${m.nav_discover()} · ${m.app_name()}` }] }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const requests = useQuery(discoverRequestsQuery());
  const skeletons = Array.from({ length: 4 }, (_, i) => (
    <MediaRowItem key={i}>
      <Skeleton className="aspect-[2/3] w-full" />
    </MediaRowItem>
  ));

  return (
    <div className="flex flex-col gap-10">
      <h1 className="sr-only">{m.nav_discover()}</h1>

      {requests.data && requests.data.recentlyAdded.length > 0 ? (
        <MediaRow title={m.discover_recently_added()}>
          {requests.data.recentlyAdded.map((item) => (
            <MediaRowItem key={`${item.type}:${item.externalId}`}>
              <Link
                to="/media/$type/$id"
                params={{ type: item.type, id: item.externalId }}
                className="group flex flex-col gap-2"
              >
                <Cover
                  src={item.coverUrl}
                  type={item.type}
                  className="transition-opacity group-hover:opacity-90"
                />
                <span className="line-clamp-2 text-sm font-medium group-hover:underline">
                  {item.title}
                </span>
                {item.authors.length > 0 ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {formatList(item.authors)}
                  </span>
                ) : null}
              </Link>
            </MediaRowItem>
          ))}
        </MediaRow>
      ) : null}

      <MediaRow
        title={m.discover_recent_requests()}
        action={
          <Link
            to="/requests"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {m.discover_see_all()}
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        }
      >
        {requests.isPending ? skeletons : null}
        {requests.data?.recentRequests.length === 0 ? (
          <li className="text-sm text-muted-foreground">{m.discover_empty_requests()}</li>
        ) : null}
        {requests.data?.recentRequests.map((request) => (
          <MediaRowItem key={request.id} wide>
            <RequestCard request={request} />
          </MediaRowItem>
        ))}
      </MediaRow>

      <TrendingRow type="audiobook" />
      <TrendingRow type="ebook" />
    </div>
  );
}
