import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { formatList } from "#/lib/format";
import { canonicalLanguage, languageName } from "#/lib/languages";
import type { SearchableType } from "#/lib/media-types";
import { relatedSeriesQuery } from "#/lib/queries/media";
import { getLocale } from "#/paraglide/runtime.js";
import { m } from "#/paraglide/messages.js";

/**
 * For a series (or a title of one) in a language Chaptarr refuses: its other
 * versions in an accepted language, e.g. "Also in French: Solo Leveling (French
 * Numbering)". The reader's own language comes first. Renders nothing when there
 * are none.
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
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground">
        {m.media_also_in_languages({ languages: formatList(languages.map(languageName)) })}
      </p>
      <ul className="flex flex-col gap-1">
        {data.map((series) => (
          <li key={series.id}>
            <Link
              to="/series/$type/$id"
              params={{ type, id: series.id }}
              className="font-medium text-primary hover:underline"
            >
              {series.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
