import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, LanguagesIcon } from "lucide-react";

import { Cover } from "#/components/media/cover";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { formatList } from "#/lib/format";
import { canonicalLanguage, languageName } from "#/lib/languages";
import type { SearchableType } from "#/lib/media-types";
import { relatedSeriesQuery } from "#/lib/queries/media";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

/**
 * For a series (or a title of one) in a language Chaptarr refuses: its other
 * versions in an accepted language, e.g. "Also in French" with "Solo Leveling
 * (French Numbering)", each a link with its cover and size. The reader's own
 * language comes first in the title. Renders nothing when there are none.
 */
export function RelatedSeries({
  type,
  seriesId,
  seriesName,
}: {
  type: SearchableType;
  seriesId: string;
  seriesName: string;
}) {
  const { data } = useQuery(relatedSeriesQuery(type, seriesId, seriesName));
  if (!data || data.length === 0) return null;
  const mine = canonicalLanguage(getLocale());
  const languages = [...new Set(data.flatMap((series) => series.languages))].toSorted(
    (a, b) => Number(b === mine) - Number(a === mine),
  );
  return (
    <Card size="sm" className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LanguagesIcon className="size-4 text-muted-foreground" aria-hidden />
          {m.media_also_in_languages({ languages: formatList(languages.map(languageName)) })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="-mx-1.5 flex flex-col gap-1">
          {data.map((series) => (
            <li key={series.id}>
              <Link
                to="/series/$type/$id"
                params={{ type, id: series.id }}
                className="flex items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-muted"
              >
                <Cover src={series.coverUrl} type={type} className="w-9 shrink-0 rounded-sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="line-clamp-2 text-sm font-medium">{series.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      series.author,
                      series.booksCount > 0
                        ? m.collection_count({ count: series.booksCount })
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
