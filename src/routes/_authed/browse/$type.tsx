import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import * as v from "valibot";

import { SwitchField } from "#/components/form/switch-field";
import { FormError } from "#/components/form/form-error";
import { InfiniteScrollTrigger } from "#/components/media/infinite-scroll-trigger";
import { MediaCard } from "#/components/media/media-card";
import { Skeleton } from "#/components/ui/skeleton";
import { isSearchableType, type SearchableType } from "#/lib/media-types";
import { trendingPagesQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

/** "See all" of a Discover trending row: the full list, filterable, page by page. */
export const Route = createFileRoute("/_authed/browse/$type")({
  // No defaults here: the router would rewrite the URL with them on every visit.
  validateSearch: v.object({
    hideOwned: v.optional(v.boolean()),
    acceptedOnly: v.optional(v.boolean()),
  }),
  beforeLoad: ({ params }) => {
    if (!isSearchableType(params.type)) throw notFound();
  },
  head: () => ({ meta: [{ title: `${m.browse_title()} · ${m.app_name()}` }] }),
  component: BrowsePage,
});

const titles: Record<SearchableType, () => string> = {
  audiobook: m.discover_trending_audiobooks,
  ebook: m.discover_trending_books,
};

function BrowsePage() {
  const { type } = Route.useParams();
  if (!isSearchableType(type)) return null;
  return <BrowseList type={type} />;
}

function BrowseList({ type }: { type: SearchableType }) {
  const { hideOwned = false, acceptedOnly = false } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const pages = useInfiniteQuery(trendingPagesQuery(type));
  const first = pages.data?.pages[0];
  const seen = new Set<string>();
  const items = (pages.data?.pages ?? [])
    .flatMap((page) => (page.ok ? page.results : []))
    // Pages can overlap when the ranking moves: one card per title.
    .filter((item) => !seen.has(item.externalId) && seen.add(item.externalId))
    .filter((item) => !hideOwned || item.availability === "none")
    .filter((item) => !acceptedOnly || item.accepted !== false);
  const acceptedLanguages = first?.ok ? first.acceptedLanguages : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{titles[type]()}</h1>
      <div className="flex flex-wrap gap-6">
        <SwitchField
          label={m.browse_hide_owned()}
          isSelected={hideOwned}
          onChange={(value) => void navigate({ search: (s) => ({ ...s, hideOwned: value }) })}
        />
        <SwitchField
          label={m.browse_accepted_only()}
          isSelected={acceptedOnly}
          onChange={(value) => void navigate({ search: (s) => ({ ...s, acceptedOnly: value }) })}
        />
      </div>
      {pages.isPending ? <Skeleton className="h-64 w-full" /> : null}
      {first && !first.ok ? (
        <FormError
          message={serviceErrorMessage(type === "ebook" ? "hardcover" : "audible", first.error)}
        />
      ) : null}
      {first?.ok && items.length === 0 ? (
        <p className="text-muted-foreground">{m.collection_empty()}</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item) => (
          <li key={item.externalId}>
            <MediaCard type={type} item={item} acceptedLanguages={acceptedLanguages} />
          </li>
        ))}
      </ul>
      <InfiniteScrollTrigger
        hasNextPage={pages.hasNextPage}
        isFetchingNextPage={pages.isFetchingNextPage}
        fetchNextPage={pages.fetchNextPage}
      />
    </div>
  );
}
