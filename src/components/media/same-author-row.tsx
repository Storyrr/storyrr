import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import { MediaCard } from "#/components/media/media-card";
import { MediaRow, MediaRowItem } from "#/components/media/media-row";
import { SeriesCard } from "#/components/media/series-card";
import { Skeleton } from "#/components/ui/skeleton";
import type { SearchableType } from "#/lib/media-types";
import { authorQuery } from "#/lib/queries/media";
import { groupBySeries } from "#/lib/series";
import { m } from "#/paraglide/messages.js";

/**
 * On a series page: the author's other works (Seerr's recommendations, for
 * books), their other series as one card each, this series left out. Renders
 * nothing when there are none or the provider fails: it's a suggestion.
 */
export function SameAuthorRow({
  type,
  seriesId,
  author,
}: {
  type: SearchableType;
  seriesId: string;
  author: { id: string; name: string };
}) {
  const works = useQuery(authorQuery(type, author.id, author.name));
  if (works.isPending) {
    return (
      <MediaRow title={m.series_same_author({ author: author.name })}>
        {Array.from({ length: 6 }, (_, i) => (
          <MediaRowItem key={i}>
            <Skeleton className="aspect-[2/3] w-full" />
          </MediaRowItem>
        ))}
      </MediaRow>
    );
  }
  if (!works.data?.ok) return null;
  const { results, acceptedLanguages } = works.data;
  const entries = groupBySeries(results).filter((entry) =>
    entry.kind === "title" ? entry.item.series[0]?.id !== seriesId : entry.series.id !== seriesId,
  );
  if (entries.length === 0) return null;
  return (
    <MediaRow
      title={m.series_same_author({ author: author.name })}
      action={
        <Link
          to="/authors/$type/$id"
          params={{ type, id: author.id }}
          search={{ name: author.name }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          {m.discover_see_all()}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      }
    >
      {entries.map((entry) =>
        entry.kind === "series" ? (
          <MediaRowItem key={`series-${entry.series.id}`}>
            <SeriesCard type={type} series={entry.series} acceptedLanguages={acceptedLanguages} />
          </MediaRowItem>
        ) : (
          <MediaRowItem key={entry.item.externalId}>
            <MediaCard type={type} item={entry.item} acceptedLanguages={acceptedLanguages} />
          </MediaRowItem>
        ),
      )}
    </MediaRow>
  );
}
