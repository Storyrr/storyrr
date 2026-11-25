import { useRouteContext } from "@tanstack/react-router";

import { LanguageNotice } from "#/components/media/language-notice";
import { MediaPoster } from "#/components/media/media-poster";
import { RequestSeriesDialog } from "#/components/media/request-series-dialog";
import type { SearchableType } from "#/lib/media-types";
import { can } from "#/lib/permissions";
import type { SeriesEntry } from "#/lib/series";

/** A series in a list of titles (search, an author's works): one card for all its volumes, opening the series page; Request picks volumes. */
export function SeriesCard({
  type,
  series,
  acceptedLanguages,
}: {
  type: SearchableType;
  series: SeriesEntry;
  acceptedLanguages: readonly string[] | null;
}) {
  const { user } = useRouteContext({ from: "/_authed" });
  const refused = series.availability === "none" && series.accepted === false;
  let action: React.ReactNode;
  if (refused && acceptedLanguages)
    action = <LanguageNotice acceptedLanguages={acceptedLanguages} />;
  else if (series.availability === "none" && !refused && can(user, `request_${type}`))
    action = (
      <RequestSeriesDialog
        type={type}
        seriesId={series.id}
        name={series.name}
        size="sm"
        className="w-full"
      />
    );
  return (
    <MediaPoster
      type={type}
      item={{
        externalId: series.id,
        title: series.name,
        authors: series.authors,
        coverUrl: series.coverUrl,
      }}
      availability={series.availability}
      refused={refused}
      series={{ booksCount: series.booksCount }}
      action={action}
    />
  );
}
