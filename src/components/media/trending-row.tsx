import { useQuery } from "@tanstack/react-query";

import { FormError } from "#/components/form/form-error";
import { MediaCard } from "#/components/media/media-card";
import { MediaRow, MediaRowItem } from "#/components/media/media-row";
import { Skeleton } from "#/components/ui/skeleton";
import type { SearchableType } from "#/lib/media-types";
import { trendingQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

const titles: Record<SearchableType, () => string> = {
  audiobook: m.discover_trending_audiobooks,
  ebook: m.discover_trending_books,
};

/** Audible bestsellers or Hardcover trending, as a Discover row. */
export function TrendingRow({ type }: { type: SearchableType }) {
  const trending = useQuery(trendingQuery(type));
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
  return <MediaRow title={titles[type]()}>{content}</MediaRow>;
}
