import { Link } from "@tanstack/react-router";
import { LanguagesIcon } from "lucide-react";

import { AvailabilityBadge } from "#/components/media/availability-badge";
import { Cover } from "#/components/media/cover";
import { RelatedSeries } from "#/components/media/related-series";
import { RequestDialog } from "#/components/media/request-dialog";
import { RequestSeriesDialog } from "#/components/media/request-series-dialog";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent } from "#/components/ui/card";
import { formatDuration, formatList, formatNumber, yearOf } from "#/lib/format";
import { useImageUrl } from "#/lib/images";
import { formatLanguages } from "#/lib/languages";
import type { SearchableType } from "#/lib/media-types";
import { seriesAvailability, type AnnotatedTitle, type SeriesAvailability } from "#/lib/series";
import { cn } from "#/lib/utils";
import { m } from "#/paraglide/messages.js";

const kickers: Record<SearchableType, () => string> = {
  audiobook: m.series_kicker_audiobook,
  ebook: m.series_kicker_ebook,
};

/** The series' status in its header, like Seerr's "Partially available". */
function SeriesStatus({ status }: { status: SeriesAvailability }) {
  if (status === "none") return null;
  if (status === "available") return <Badge>{m.availability_available()}</Badge>;
  if (status === "partial") return <Badge>{m.series_partially_available()}</Badge>;
  return <Badge variant="secondary">{m.availability_requested()}</Badge>;
}

/**
 * The series' authors: those credited on most volumes (Audible lists each volume's
 * translator as an author too), linked to their page when the provider gave an id.
 */
function seriesAuthors(items: readonly AnnotatedTitle[]) {
  const counts = new Map<string, { id?: string; volumes: number }>();
  for (const item of items) {
    const ids = new Map((item.authorRefs ?? []).map((ref) => [ref.name, ref.id]));
    for (const name of new Set(item.authors)) {
      const entry = counts.get(name) ?? { volumes: 0 };
      counts.set(name, { id: entry.id ?? ids.get(name), volumes: entry.volumes + 1 });
    }
  }
  const credited = items.filter((item) => item.authors.length > 0).length;
  const main = [...counts].filter(([, entry]) => entry.volumes >= credited * 0.75);
  return main.map(([name, entry]) => ({ name, id: entry.id }));
}

/** "2019 – 2025", or one year. */
function yearSpan(items: readonly AnnotatedTitle[]): string | undefined {
  const years = items.flatMap((item) => yearOf(item.releaseDate) ?? []).toSorted();
  const [first] = years;
  const last = years.at(-1);
  if (!first || !last) return undefined;
  return first === last ? first : `${first} – ${last}`;
}

/**
 * A series page laid out like Seerr's show page: a header over the blurred cover
 * (status, name, volumes, years, authors, Request the series), the summary and
 * the volumes as rows (Seerr's seasons), and a facts panel.
 */
export function SeriesView({
  type,
  id,
  name,
  description,
  items,
  acceptedLanguages,
  canRequest,
}: {
  type: SearchableType;
  id: string;
  name: string;
  description?: string;
  items: AnnotatedTitle[];
  acceptedLanguages: readonly string[] | null;
  canRequest: boolean;
}) {
  const imageUrl = useImageUrl();
  const cover = items.find((item) => item.coverUrl)?.coverUrl;
  const authors = seriesAuthors(items);
  const years = yearSpan(items);
  const allRefused = items.length > 0 && items.every((item) => item.accepted === false);
  const narrators = [...new Set(items.flatMap((item) => item.narrators))];
  const publishers = [...new Set(items.flatMap((item) => item.publisher ?? []))];
  const languages = [
    ...new Set(items.flatMap((item) => item.languages ?? []).filter((code) => code !== null)),
  ];
  const minutes = items.reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);
  const pages = items.reduce((sum, item) => sum + (item.pages ?? 0), 0);
  const facts: [string, React.ReactNode][] = [
    [m.series_fact_volumes(), formatNumber(items.length)],
    [m.series_fact_published(), years],
    [m.series_fact_narrators(), narrators.length > 0 ? formatList(narrators.slice(0, 4)) : null],
    [m.media_publisher(), publishers.length > 0 ? formatList(publishers.slice(0, 3)) : null],
    [m.media_languages(), languages.length > 0 ? formatLanguages(languages) : null],
    [m.media_duration(), minutes > 0 ? formatDuration(minutes) : null],
    [m.media_pages(), pages > 0 ? formatNumber(pages) : null],
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="relative isolate overflow-hidden rounded-xl border">
        {cover ? (
          <img
            src={imageUrl(cover)}
            alt=""
            className="absolute inset-0 -z-10 size-full scale-110 object-cover opacity-40 blur-2xl"
          />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/80 to-background/40" />
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-end">
          <Cover
            src={cover}
            type={type}
            className={cn("shrink-0 shadow-lg", type === "ebook" ? "w-36" : "w-44")}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{kickers[type]()}</Badge>
              <SeriesStatus status={seriesAvailability(items)} />
            </div>
            <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{name}</h1>
            <p className="text-muted-foreground">
              {[m.collection_count({ count: items.length }), years].filter(Boolean).join(" · ")}
            </p>
            {authors.length > 0 ? (
              <p className="flex flex-wrap gap-x-1">
                <span>{m.media_by_prefix()}</span>
                {authors.map((author, index) => (
                  <span key={author.name}>
                    {author.id ? (
                      <Link
                        to="/authors/$type/$id"
                        params={{ type, id: author.id }}
                        search={{ name: author.name }}
                        className="font-medium hover:underline"
                      >
                        {author.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{author.name}</span>
                    )}
                    {index < authors.length - 1 ? "," : null}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          {canRequest && items.length > 0 ? (
            <div className="shrink-0">
              <RequestSeriesDialog type={type} seriesId={id} name={name} items={items} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {description ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-heading text-xl font-semibold">{m.series_summary()}</h2>
              <p className="max-w-3xl text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {description}
              </p>
            </section>
          ) : null}
          {allRefused ? <RelatedSeries type={type} seriesId={id} seriesName={name} /> : null}
          <section className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">{m.series_volumes()}</h2>
            {items.length === 0 ? (
              <p className="text-muted-foreground">{m.collection_empty()}</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {items.map((item) => (
                  <VolumeRow
                    key={item.externalId}
                    type={type}
                    item={item}
                    acceptedLanguages={acceptedLanguages}
                    canRequest={canRequest}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>
        <aside>
          <Card size="sm">
            <CardContent>
              <dl className="flex flex-col divide-y text-sm">
                {facts
                  .filter(([, value]) => Boolean(value))
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 py-2">
                      <dt className="font-medium">{label}</dt>
                      <dd className="text-right text-muted-foreground">{value}</dd>
                    </div>
                  ))}
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/** One volume as a row: cover, number and title (to its page), year and length, then its status or Request. */
function VolumeRow({
  type,
  item,
  acceptedLanguages,
  canRequest,
}: {
  type: SearchableType;
  item: AnnotatedTitle;
  acceptedLanguages: readonly string[] | null;
  canRequest: boolean;
}) {
  const position = item.series[0]?.position;
  const refused = item.availability === "none" && item.accepted === false;
  const details = [
    yearOf(item.releaseDate),
    item.durationMinutes ? formatDuration(item.durationMinutes) : undefined,
    item.pages ? m.series_page_count({ count: formatNumber(item.pages) }) : undefined,
  ].filter(Boolean);
  let status: React.ReactNode = null;
  if (item.availability !== "none") status = <AvailabilityBadge availability={item.availability} />;
  else if (refused)
    status = (
      <span
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
        title={
          acceptedLanguages
            ? m.media_language_not_accepted({ languages: formatLanguages(acceptedLanguages) })
            : undefined
        }
      >
        <LanguagesIcon className="size-3.5" aria-hidden />
        {m.media_language_refused_short()}
      </span>
    );
  else if (canRequest) status = <RequestDialog item={{ ...item, type }} size="sm" />;

  return (
    <li className="relative flex items-center gap-4 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50">
      <Cover src={item.coverUrl} type={type} className="w-12 shrink-0 rounded-md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {position ? (
          <span className="text-xs font-medium text-muted-foreground">
            {m.collection_volume({ position })}
          </span>
        ) : null}
        <Link
          to="/media/$type/$id"
          params={{ type, id: item.externalId }}
          className="truncate font-medium after:absolute after:inset-0 hover:underline"
        >
          {item.title}
        </Link>
        {details.length > 0 ? (
          <span className="text-xs text-muted-foreground">{details.join(" · ")}</span>
        ) : null}
      </div>
      {/* Above the row's link, so its button or tooltip stays usable. */}
      {status ? <div className="relative z-10 shrink-0">{status}</div> : null}
    </li>
  );
}
