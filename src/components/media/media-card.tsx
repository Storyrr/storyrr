import { Link } from "@tanstack/react-router";

import { AvailabilityBadge } from "#/components/media/availability-badge";
import { Cover } from "#/components/media/cover";
import { RequestDialog } from "#/components/media/request-dialog";
import { Badge } from "#/components/ui/badge";
import type { MediaSummary } from "#/lib/media";
import type { SearchableType } from "#/lib/media-types";
import { formatList, yearOf } from "#/lib/format";
import type { MediaAvailability } from "#/lib/request-status";
import { m } from "#/paraglide/messages.js";

/** A search result: cover, title, people, year, series and status or Request. */
export function MediaCard({
  type,
  item,
}: {
  type: SearchableType;
  item: MediaSummary & { availability: MediaAvailability };
}) {
  const series = item.series[0];
  return (
    <article className="flex flex-col gap-2">
      <Link
        to="/media/$type/$id"
        params={{ type, id: item.externalId }}
        className="group flex flex-col gap-2"
      >
        <Cover
          src={item.coverUrl}
          type={type}
          className="transition-opacity group-hover:opacity-90"
        />
        <h2 className="line-clamp-2 text-sm font-medium group-hover:underline">{item.title}</h2>
      </Link>
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {item.authors.length > 0 ? <p className="truncate">{formatList(item.authors)}</p> : null}
        {item.narrators.length > 0 ? (
          <p className="truncate">
            {m.media_narrated_by({ narrators: formatList(item.narrators) })}
          </p>
        ) : null}
        {yearOf(item.releaseDate) ? <p>{yearOf(item.releaseDate)}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {series ? (
          <Badge variant="outline" className="max-w-full truncate">
            {series.position
              ? m.media_series({ name: series.name, position: series.position })
              : m.media_series_no_position({ name: series.name })}
          </Badge>
        ) : null}
        <AvailabilityBadge availability={item.availability} />
      </div>
      {item.availability === "none" ? <RequestDialog item={{ ...item, type }} size="sm" /> : null}
    </article>
  );
}
