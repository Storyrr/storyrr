import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { MediaPoster } from "#/components/media/media-poster";
import type { SearchableType } from "#/lib/media-types";
import { seriesSearchQuery } from "#/lib/queries/media";
import { m } from "#/paraglide/messages.js";

/**
 * Series matching the search (Hardcover), below the books: a translation numbered
 * apart ("Solo Leveling (French Numbering)") is its own series there, and its
 * little-read volumes rarely make the books' first results. Hidden when empty
 * or failing (the books above already show the provider's error).
 */
export function SeriesResults({ type, query }: { type: SearchableType; query: string }) {
  const search = useQuery(seriesSearchQuery(type, query));
  const headingId = useId();
  if (!search.data?.ok || search.data.results.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-lg font-semibold">
        {m.search_series_title()}
      </h2>
      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        aria-busy={search.isFetching}
      >
        {search.data.results.map((series) => (
          <li key={series.id}>
            <MediaPoster
              type={type}
              item={{
                externalId: series.id,
                title: series.name,
                authors: series.author ? [series.author] : [],
                coverUrl: series.coverUrl,
              }}
              availability="none"
              refused={series.accepted === false}
              series={{ booksCount: series.booksCount }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
