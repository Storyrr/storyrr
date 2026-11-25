import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { FormError } from "#/components/form/form-error";
import { MediaCard } from "#/components/media/media-card";
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
 * Search results for one type, as a grid of cards (with a heading when several
 * types are shown). A series' volumes make one series card, like Seerr shows a
 * show once; eBooks add the series Hardcover's series search finds (a translation
 * numbered apart is its own series there, its volumes rarely among the books found).
 */
export function SearchResults({
  type,
  query,
  titled,
}: {
  type: SearchableType;
  query: string;
  titled: boolean;
}) {
  const search = useQuery(mediaSearchQuery(type, query));
  // Best effort, added when it arrives: the titles don't wait for it.
  const seriesSearch = useQuery({ ...seriesSearchQuery(type, query), enabled: type === "ebook" });
  const headingId = useId();

  let body: React.ReactNode;
  if (search.isPending) {
    body = <ResultsSkeleton />;
  } else if (search.isError) {
    body = <FormError message={search.error.message || m.error_generic()} />;
  } else if (!search.data.ok) {
    body = <FormError message={serviceErrorMessage(providers[type], search.data.error)} />;
  } else if (search.data.results.length === 0) {
    body = <p className="text-muted-foreground">{m.search_no_results({ query })}</p>;
  } else {
    const { results, acceptedLanguages } = search.data;
    const extra = seriesSearch.data?.ok ? seriesSearch.data.results : [];
    const entries = groupBySeries(results, extra).toSorted(
      (x, y) => acceptanceRank(entryAccepted(x)) - acceptanceRank(entryAccepted(y)),
    );
    body = (
      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        aria-busy={search.isFetching}
      >
        {entries.map((entry) =>
          entry.kind === "series" ? (
            <li key={`series-${entry.series.id}`}>
              <SeriesCard type={type} series={entry.series} acceptedLanguages={acceptedLanguages} />
            </li>
          ) : (
            <li key={entry.item.externalId}>
              <MediaCard type={type} item={entry.item} acceptedLanguages={acceptedLanguages} />
            </li>
          ),
        )}
      </ul>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={titled ? headingId : undefined}>
      {titled ? (
        <h2 id={headingId} className="text-lg font-semibold">
          {sectionTitles[type]()}
        </h2>
      ) : null}
      {body}
    </section>
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
