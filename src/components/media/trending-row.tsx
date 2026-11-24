import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import { FormError } from "#/components/form/form-error";
import { MediaCard } from "#/components/media/media-card";
import { MediaRow, MediaRowItem } from "#/components/media/media-row";
import { Skeleton } from "#/components/ui/skeleton";
import type { SearchableType } from "#/lib/media-types";
import type { getTrending, searchMedia } from "#/functions/media.functions";
import { mediaSearchQuery, trendingQuery } from "#/lib/queries/media";
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

/** A custom Discover row: the results of a search (Settings → General → Discover). */
export function SearchRow({
  type,
  title,
  query,
}: {
  type: SearchableType;
  title: string;
  query: string;
}) {
  const search = useQuery(mediaSearchQuery(type, query));
  return (
    <ResultsRow
      type={type}
      title={title}
      result={search}
      seeAll={
        <Link
          to="/search"
          search={{ q: query }}
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
  Awaited<ReturnType<typeof getTrending>> | Awaited<ReturnType<typeof searchMedia>>
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
