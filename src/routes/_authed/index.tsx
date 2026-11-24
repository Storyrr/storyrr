import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import { MediaPoster } from "#/components/media/media-poster";
import { MediaRow, MediaRowItem } from "#/components/media/media-row";
import { RequestCard } from "#/components/requests/request-card";
import { SearchRow, TrendingRow } from "#/components/media/trending-row";
import { Skeleton } from "#/components/ui/skeleton";
import { discoverLayoutQuery } from "#/lib/queries/media";
import { discoverRequestsQuery } from "#/lib/queries/requests";
import { m } from "#/paraglide/messages.js";

/** Discover (Seerr-like): what's popular, the latest requests, what just arrived. */
export const Route = createFileRoute("/_authed/")({
  head: () => ({ meta: [{ title: `${m.nav_discover()} · ${m.app_name()}` }] }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const requests = useQuery(discoverRequestsQuery());
  const layout = useQuery(discoverLayoutQuery());
  const skeletons = Array.from({ length: 4 }, (_, i) => (
    <MediaRowItem key={i}>
      <Skeleton className="aspect-[2/3] w-full" />
    </MediaRowItem>
  ));

  return (
    <div className="flex flex-col gap-10">
      <h1 className="sr-only">{m.nav_discover()}</h1>

      {layout.data
        ?.filter((row) => row.enabled)
        .map((row) => {
          switch (row.kind) {
            case "recently_added":
              return requests.data && requests.data.recentlyAdded.length > 0 ? (
                <MediaRow key={row.id} title={m.discover_recently_added()}>
                  {requests.data.recentlyAdded.map((item) => (
                    <MediaRowItem key={`${item.type}:${item.externalId}`}>
                      <MediaPoster type={item.type} item={item} availability="available" />
                    </MediaRowItem>
                  ))}
                </MediaRow>
              ) : null;
            case "recent_requests":
              return (
                <MediaRow
                  key={row.id}
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
              );
            case "trending":
              return row.type ? <TrendingRow key={row.id} type={row.type} /> : null;
            default:
              return row.type && row.query ? (
                <SearchRow
                  key={row.id}
                  type={row.type}
                  title={row.title || row.query}
                  query={row.query}
                />
              ) : null;
          }
        })}
    </div>
  );
}
