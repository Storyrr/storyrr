import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import { FormError } from "#/components/form/form-error";
import { MediaCard } from "#/components/media/media-card";
import { MediaRow, MediaRowItem } from "#/components/media/media-row";
import { Skeleton } from "#/components/ui/skeleton";
import type { SearchableType } from "#/lib/media-types";
import type { exploreMedia, getTrending } from "#/functions/media.functions";
import type { FilteredDiscoverRow } from "#/lib/discover";
import { applyStatusFilters } from "#/lib/explore";
import {
  exploreRowQuery,
  genreOptionsQuery,
  trendingQuery,
  upcomingBooksQuery,
} from "#/lib/queries/media";
import { cn } from "#/lib/utils";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

const titles: Record<SearchableType, () => string> = {
  audiobook: m.discover_trending_audiobooks,
  ebook: m.discover_trending_books,
};

/** Audible bestsellers or Hardcover trending, as a Discover row. */
export function TrendingRow({ type }: { type: SearchableType }) {
  const trending = useQuery(trendingQuery(type));
  return (
    <ResultsRow
      type={type}
      title={titles[type]()}
      result={trending}
      seeAll={
        <Link
          to="/browse/$type"
          params={{ type }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {m.discover_see_all()}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      }
    />
  );
}

/** Card colors of the genre rows (theme tokens), in turn. */
const GENRE_COLORS = [
  "bg-genre-1",
  "bg-genre-2",
  "bg-genre-3",
  "bg-genre-4",
  "bg-genre-5",
  "bg-genre-6",
  "bg-genre-7",
  "bg-genre-8",
] as const;

/** Genres shown in a row: Hardcover's most used ones include catch-alls. */
const GENRE_ROW_SIZE = 20;
const CATCH_ALL_GENRES = new Set(["fiction", "general", "nonfiction"]);

/** Seerr's "Series by genre": a card per genre, opening Books / Audiobooks filtered by it. */
export function GenreRow({ type }: { type: SearchableType }) {
  const genres = useQuery(genreOptionsQuery(type));
  const list = (genres.data ?? [])
    .filter((genre) => !CATCH_ALL_GENRES.has(genre.id))
    .slice(0, GENRE_ROW_SIZE);
  if (genres.isSuccess && list.length === 0) return null;
  return (
    <MediaRow title={type === "ebook" ? m.discover_genres_books() : m.discover_genres_audiobooks()}>
      {genres.isPending
        ? Array.from({ length: 5 }, (_, i) => (
            <MediaRowItem key={i} wide>
              <Skeleton className="h-32 w-full rounded-xl" />
            </MediaRowItem>
          ))
        : list.map((genre, index) => (
            <MediaRowItem key={genre.id} wide>
              <Link
                {...(type === "ebook"
                  ? { to: "/books", search: { genres: [genre.id] } }
                  : { to: "/audiobooks", search: { genre: genre.id } })}
                className={cn(
                  "flex h-32 items-center justify-center rounded-xl p-4 text-center font-heading text-2xl font-semibold text-balance text-white shadow-sm ring-primary/70 transition outline-none hover:scale-[1.02] hover:ring-2 focus-visible:ring-2",
                  GENRE_COLORS[index % GENRE_COLORS.length],
                )}
              >
                {genre.name}
              </Link>
            </MediaRowItem>
          ))}
    </MediaRow>
  );
}

/** Books not out yet, the most awaited first (Hardcover; Audible can't list upcoming titles). */
export function UpcomingRow() {
  const upcoming = useQuery(upcomingBooksQuery());
  return (
    <ResultsRow
      type="ebook"
      title={m.discover_upcoming_books()}
      result={upcoming}
      seeAll={
        <Link
          to="/books"
          search={{ sort: "upcoming" }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {m.discover_see_all()}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      }
    />
  );
}

/** A filtered Discover row (Settings → General → Discover): Books or Audiobooks with a sort and filters. */
export function FilteredRow({ row }: { row: FilteredDiscoverRow }) {
  const rowQuery =
    row.type === "audiobook"
      ? exploreRowQuery({ type: "audiobook", filters: row.filters })
      : exploreRowQuery({ type: "ebook", filters: row.filters });
  const results = useQuery({
    ...rowQuery,
    // Storyrr's own switches (hide owned, accepted languages) aren't catalog filters.
    select: (data) =>
      data.ok ? { ...data, results: applyStatusFilters(data.results, row.filters) } : data,
  });
  return (
    <ResultsRow
      type={row.type}
      title={row.title}
      result={results}
      seeAll={
        <Link
          {...(row.type === "ebook"
            ? { to: "/books", search: row.filters }
            : { to: "/audiobooks", search: row.filters })}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {m.discover_see_all()}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      }
    />
  );
}

type Results = UseQueryResult<
  Awaited<ReturnType<typeof getTrending>> | Awaited<ReturnType<typeof exploreMedia>>
>;

function ResultsRow({
  type,
  title,
  result: trending,
  seeAll,
}: {
  type: SearchableType;
  title: string;
  result: Results;
  seeAll: React.ReactNode;
}) {
  let content: React.ReactNode;
  if (trending.isPending) {
    content = Array.from({ length: 6 }, (_, i) => (
      <MediaRowItem key={i}>
        <Skeleton className="aspect-[2/3] w-full" />
      </MediaRowItem>
    ));
  } else if (trending.isError) {
    content = (
      <li className="w-full">
        <FormError message={trending.error.message || m.error_generic()} />
      </li>
    );
  } else if (!trending.data.ok) {
    content = (
      <li className="w-full">
        <FormError
          message={serviceErrorMessage(
            type === "ebook" ? "hardcover" : "audible",
            trending.data.error,
          )}
        />
      </li>
    );
  } else {
    const { results, acceptedLanguages } = trending.data;
    content = results.map((item) => (
      <MediaRowItem key={item.externalId}>
        <MediaCard type={type} item={item} acceptedLanguages={acceptedLanguages} />
      </MediaRowItem>
    ));
  }
  return (
    <MediaRow title={title} action={seeAll}>
      {content}
    </MediaRow>
  );
}
