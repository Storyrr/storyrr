import { useQuery } from "@tanstack/react-query";

import { FormError } from "#/components/form/form-error";
import { MediaCard } from "#/components/media/media-card";
import { MediaRow, MediaRowItem } from "#/components/media/media-row";
import { SeriesCard } from "#/components/media/series-card";
import { Skeleton } from "#/components/ui/skeleton";
import type { SearchableType } from "#/lib/media-types";
import { mediaSearchQuery, seriesSearchQuery } from "#/lib/queries/media";
import { groupBySeries } from "#/lib/series";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

export const sectionTitles: Record<SearchableType, () => string> = {
  audiobook: m.search_tab_audiobooks,
  ebook: m.search_tab_books,
};
const providers: Record<SearchableType, "audible" | "hardcover"> = {
  audiobook: "audible",
  ebook: "hardcover",
};

/**
 * A type's search results, ready to show: a series' volumes make one series
 * entry, like Seerr shows a show once; eBooks add the series Hardcover's series
 * search finds (a translation numbered apart is its own series there, its
 * volumes rarely among the books found). Accepted languages come first.
 */
export function useSearchEntries(type: SearchableType, query: string) {
  const search = useQuery(mediaSearchQuery(type, query));
  // Best effort, added when it arrives: the titles don't wait for it.
  const seriesSearch = useQuery({ ...seriesSearchQuery(type, query), enabled: type === "ebook" });
  const found = search.data?.ok ? search.data : null;
  const extra = seriesSearch.data?.ok ? seriesSearch.data.results : [];
  const entries = found
    ? groupBySeries(found.results, extra).toSorted(
        (x, y) => acceptanceRank(entryAccepted(x)) - acceptanceRank(entryAccepted(y)),
      )
    : [];
  return { search, entries, acceptedLanguages: found?.acceptedLanguages ?? null };
}

/**
 * Search results for one type. `layout="grid"`: every result, as a grid of
 * cards. `layout="row"`: a preview, one scrolling row under its title with
 * `action` (a link to the full grid) next to it.
 */
export function SearchResults({
  type,
  query,
  layout,
  action,
}: {
  type: SearchableType;
  query: string;
  layout: "grid" | "row";
  action?: React.ReactNode;
}) {
  const { search, entries, acceptedLanguages } = useSearchEntries(type, query);
  const row = layout === "row";

  let message: React.ReactNode = null;
  if (search.isError) {
    message = <FormError message={search.error.message || m.error_generic()} />;
  } else if (search.data && !search.data.ok) {
    message = <FormError message={serviceErrorMessage(providers[type], search.data.error)} />;
  } else if (search.data && entries.length === 0) {
    message = <p className="text-muted-foreground">{m.search_no_results({ query })}</p>;
  }

  const cards = entries.map((entry) => {
    const card =
      entry.kind === "series" ? (
        <SeriesCard type={type} series={entry.series} acceptedLanguages={acceptedLanguages} />
      ) : (
        <MediaCard type={type} item={entry.item} acceptedLanguages={acceptedLanguages} />
      );
    const key = entry.kind === "series" ? `series-${entry.series.id}` : entry.item.externalId;
    return row ? <MediaRowItem key={key}>{card}</MediaRowItem> : <li key={key}>{card}</li>;
  });

  if (row) {
    return (
      <MediaRow title={sectionTitles[type]()} action={action}>
        {search.isPending
          ? Array.from({ length: 6 }, (_, i) => (
              <MediaRowItem key={i}>
                <Skeleton className="aspect-[2/3] w-full" />
              </MediaRowItem>
            ))
          : null}
        {message ? <li className="w-full">{message}</li> : cards}
      </MediaRow>
    );
  }
  if (search.isPending) return <ResultsSkeleton />;
  return (
    message ?? (
      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
        aria-busy={search.isFetching}
      >
        {cards}
      </ul>
    )
  );
}

const entryAccepted = (entry: ReturnType<typeof groupBySeries>[number]) =>
  entry.kind === "series" ? entry.series.accepted : entry.item.accepted;
/** Accepted first, then unknown, then refused (the server's order for titles). */
const acceptanceRank = (accepted: boolean | null) =>
  accepted === true ? 0 : accepted === null ? 1 : 2;

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="aspect-square w-full" />
      ))}
    </div>
  );
}
