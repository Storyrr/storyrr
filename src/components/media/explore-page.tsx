import { useInfiniteQuery } from "@tanstack/react-query";
import { FilterIcon } from "lucide-react";

import { FormError } from "#/components/form/form-error";
import { ExploreFilterFields, SortSelect, type Explore } from "#/components/media/explore-filters";
import { InfiniteScrollTrigger } from "#/components/media/infinite-scroll-trigger";
import { MediaCard } from "#/components/media/media-card";
import { Button } from "#/components/ui/button";
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { applyStatusFilters, audiobookFilterCount, bookFilterCount } from "#/lib/explore";
import { exploreQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

/**
 * Seerr's Movies / Series page for books: the catalog as a grid that loads while
 * scrolling, a sort and a Filters panel. Filters live in the URL (shareable).
 */
export function ExplorePage({ title, ...explore }: Explore & { title: string }) {
  const pages = useInfiniteQuery(
    explore.type === "audiobook"
      ? exploreQuery({ type: "audiobook", filters: explore.filters })
      : exploreQuery({ type: "ebook", filters: explore.filters }),
  );
  const first = pages.data?.pages[0];
  const seen = new Set<string>();
  const items = applyStatusFilters(
    (pages.data?.pages ?? [])
      .flatMap((page) => (page.ok ? page.results : []))
      // Pages can overlap when the ranking moves: one card per title.
      .filter((item) => !seen.has(item.externalId) && seen.add(item.externalId)),
    explore.filters,
  );
  const acceptedLanguages = first?.ok ? first.acceptedLanguages : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SortSelect {...explore} />
          <FiltersSheet {...explore} />
        </div>
      </div>
      {pages.isPending ? <Skeleton className="h-64 w-full" /> : null}
      {first && !first.ok ? (
        <FormError
          message={serviceErrorMessage(
            explore.type === "ebook" ? "hardcover" : "audible",
            first.error,
          )}
        />
      ) : null}
      {first?.ok && items.length === 0 && !pages.hasNextPage ? (
        <p className="text-muted-foreground">{m.explore_empty()}</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {items.map((item) => (
          <li key={item.externalId}>
            <MediaCard type={explore.type} item={item} acceptedLanguages={acceptedLanguages} />
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

function FiltersSheet(explore: Explore) {
  const count =
    explore.type === "audiobook"
      ? audiobookFilterCount(explore.filters)
      : bookFilterCount(explore.filters);
  // Reset keeps the sort.
  const reset = () =>
    explore.type === "audiobook"
      ? explore.onChange({ sort: explore.filters.sort })
      : explore.onChange({ sort: explore.filters.sort });
  return (
    <SheetTrigger>
      <Button variant="outline">
        <FilterIcon data-icon="inline-start" />
        {m.explore_filters_active({ count })}
      </Button>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{m.explore_filters()}</SheetTitle>
          <SheetDescription>{m.explore_filters_count({ count })}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4">
          <ExploreFilterFields {...explore} />
        </div>
        <SheetFooter>
          <Button variant="outline" isDisabled={count === 0} onPress={reset}>
            {m.explore_reset()}
          </Button>
        </SheetFooter>
      </SheetContent>
    </SheetTrigger>
  );
}
