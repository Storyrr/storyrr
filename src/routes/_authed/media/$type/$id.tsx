import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";

import { FormError } from "#/components/form/form-error";
import { AvailabilityBadge } from "#/components/media/availability-badge";
import { Cover } from "#/components/media/cover";
import { LanguageNotice } from "#/components/media/language-notice";
import { RelatedSeries } from "#/components/media/related-series";
import { ReportIssueDialog } from "#/components/issues/report-issue-dialog";
import { BlockButton } from "#/components/media/block-button";
import { ManageTitle } from "#/components/media/manage-title";
import { Rating } from "#/components/media/rating";
import { RequestDialog } from "#/components/media/request-dialog";
import { TagList } from "#/components/media/tag-list";
import { OpenInLibrary } from "#/components/media/open-in-library";
import { TitleDownload } from "#/components/media/title-download";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent } from "#/components/ui/card";
import { formatDate, formatDuration, formatList, formatNumber } from "#/lib/format";
import { useImageUrl } from "#/lib/images";
import { languageName } from "#/lib/languages";
import { FORMAT_BADGE, isSearchableType } from "#/lib/media-types";
import { mediaQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { can } from "#/lib/permissions";
import { cn } from "#/lib/utils";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/media/$type/$id")({
  params: {
    parse: (params) => {
      if (!isSearchableType(params.type)) throw notFound();
      return { type: params.type, id: params.id };
    },
    stringify: (params) => params,
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(mediaQuery(params.type, params.id)),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.ok ? `${loaderData.item.title} · ${m.app_name()}` : m.app_name() }],
  }),
  component: MediaPage,
});

function MediaPage() {
  const { type, id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { data } = useSuspenseQuery(mediaQuery(type, id));
  const imageUrl = useImageUrl();

  if (!data.ok) {
    return (
      <FormError
        message={
          data.error.kind === "not_found"
            ? m.media_not_found()
            : serviceErrorMessage(type === "ebook" ? "hardcover" : "audible", data.error)
        }
      />
    );
  }
  const { item, availability, request, accepted, acceptedLanguages, block } = data;
  const languages = (item.languages ?? []).filter((code): code is string => code !== null);
  const facts: [string, string | undefined][] = [
    [m.media_duration(), item.durationMinutes ? formatDuration(item.durationMinutes) : undefined],
    [m.media_pages(), item.pages ? formatNumber(item.pages) : undefined],
    [m.media_release_date(), item.releaseDate ? formatDate(item.releaseDate) : undefined],
    [
      languages.length > 1 ? m.media_languages() : m.media_language(),
      languages.length > 0 ? formatList(languages.map(languageName)) : item.language,
    ],
    [m.media_publisher(), item.publisher],
  ];

  const shownFacts = facts.filter((fact): fact is [string, string] => Boolean(fact[1]));

  const [refusedSeries] = item.series;

  const requestable =
    availability === "none" && !(accepted === false && acceptedLanguages) && data.canRequest;

  return (
    <article className="flex flex-col gap-8">
      {/* Laid out like Seerr's title page: the title over its blurred cover, its actions beside. */}
      <header className="relative isolate overflow-hidden rounded-xl border">
        {item.coverUrl ? (
          <img
            src={imageUrl(item.coverUrl)}
            alt=""
            className="absolute inset-0 -z-10 size-full scale-110 object-cover opacity-40 blur-2xl"
          />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/80 to-background/40" />
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-6 text-center sm:flex-row sm:items-end sm:text-left">
            <Cover
              src={item.coverUrl}
              type={type}
              className={cn("shrink-0 shadow-lg", type === "ebook" ? "w-36" : "w-44")}
            />
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:items-start">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <Badge className={cn("border-transparent", FORMAT_BADGE[type])}>
                  {type === "ebook" ? m.media_type_ebook() : m.media_type_audiobook()}
                </Badge>
                {availability !== "none" ? <AvailabilityBadge availability={availability} /> : null}
                {request?.status === "submitted" ? <TitleDownload type={type} id={id} /> : null}
              </div>
              <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                {item.title}
              </h1>
              {item.subtitle ? (
                <p className="text-lg text-muted-foreground">{item.subtitle}</p>
              ) : null}
              {item.authorRefs && item.authorRefs.length > 0 ? (
                <p className="flex flex-wrap justify-center gap-x-1 sm:justify-start">
                  <span>{m.media_by_prefix()}</span>
                  {item.authorRefs.map((author, index) => (
                    <span key={author.id}>
                      <Link
                        to="/authors/$type/$id"
                        params={{ type, id: author.id }}
                        search={{ name: author.name }}
                        className="font-medium hover:underline"
                      >
                        {author.name}
                      </Link>
                      {index < (item.authorRefs?.length ?? 0) - 1 ? "," : null}
                    </span>
                  ))}
                </p>
              ) : item.authors.length > 0 ? (
                <p>{m.media_by({ authors: formatList(item.authors) })}</p>
              ) : null}
              {item.narrators.length > 0 ? (
                <p className="text-muted-foreground">
                  {m.media_narrated_by({ narrators: formatList(item.narrators) })}
                </p>
              ) : null}
              {item.rating ? <Rating rating={item.rating} type={type} /> : null}
              {item.series.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-1 sm:justify-start">
                  {item.series.map((series) => {
                    const label = series.position
                      ? m.media_series({ name: series.name, position: series.position })
                      : m.media_series_no_position({ name: series.name });
                    return series.id ? (
                      <Link
                        key={series.name}
                        to="/series/$type/$id"
                        params={{ type, id: series.id }}
                      >
                        <Badge variant="secondary" className="hover:bg-secondary/70">
                          {label}
                        </Badge>
                      </Link>
                    ) : (
                      <Badge key={series.name} variant="secondary">
                        {label}
                      </Badge>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
          {/* Where to read it or how to get it, then what one may do about the title. */}
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 lg:justify-end">
            {availability === "available" ? <OpenInLibrary type={type} id={id} /> : null}
            {requestable ? <RequestDialog item={{ ...item, type }} /> : null}
            {availability === "available" && can(user, "create_issues") ? (
              <ReportIssueDialog type={type} externalId={item.externalId} title={item.title} />
            ) : null}
            {can(user, "manage_requests") ? (
              <ManageTitle
                type={type}
                externalId={item.externalId}
                title={item.title}
                available={availability === "available"}
              />
            ) : null}
            {can(user, "manage_blocklist") ? (
              <BlockButton
                type={type}
                externalId={item.externalId}
                title={item.title}
                blockId={block?.id ?? null}
              />
            ) : null}
          </div>
        </div>
      </header>
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {availability === "none" && accepted === false && acceptedLanguages ? (
            <>
              <LanguageNotice
                acceptedLanguages={acceptedLanguages}
                addEditionUrl={item.addEditionUrl}
              />
              {refusedSeries?.id ? (
                <RelatedSeries
                  type={type}
                  seriesId={refusedSeries.id}
                  seriesName={refusedSeries.name}
                />
              ) : null}
            </>
          ) : null}
          {request ? (
            <p className="text-sm text-muted-foreground">
              {m.media_requested_by({ name: request.requesterName ?? m.users_deleted() })}
            </p>
          ) : null}
          {block?.reason ? (
            <p className="text-sm text-muted-foreground">
              {m.blocklist_reason_shown({ reason: block.reason })}
            </p>
          ) : null}
          {item.description ? (
            <section className="flex flex-col gap-2">
              <h2 className="font-heading text-xl font-semibold">{m.series_summary()}</h2>
              <p className="leading-relaxed whitespace-pre-line">{item.description}</p>
            </section>
          ) : null}
          <TagList type={type} tags={item.tags ?? []} />
        </div>
        {shownFacts.length > 0 ? (
          <aside className="flex flex-col gap-3">
            <h2 className="font-heading text-xl font-semibold">{m.series_details()}</h2>
            <Card size="sm">
              <CardContent>
                <dl className="flex flex-col divide-y text-sm">
                  {shownFacts.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 py-2">
                      <dt className="font-medium">{label}</dt>
                      <dd className="text-right text-muted-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </aside>
        ) : null}
      </div>
    </article>
  );
}
