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
import { RequestDialog } from "#/components/media/request-dialog";
import { TagList } from "#/components/media/tag-list";
import { Badge } from "#/components/ui/badge";
import { formatDate, formatDuration, formatList, formatNumber } from "#/lib/format";
import { languageName } from "#/lib/languages";
import { isSearchableType } from "#/lib/media-types";
import { mediaQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { can } from "#/lib/permissions";
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

  const [refusedSeries] = item.series;

  return (
    <article className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <div className="flex flex-col gap-3">
        <Cover src={item.coverUrl} type={type} className="w-full max-w-64" />
        {availability !== "none" ? (
          <AvailabilityBadge availability={availability} />
        ) : accepted === false && acceptedLanguages ? (
          <>
            <LanguageNotice acceptedLanguages={acceptedLanguages} />
            {refusedSeries?.id ? (
              <RelatedSeries
                type={type}
                seriesId={refusedSeries.id}
                seriesName={refusedSeries.name}
              />
            ) : null}
          </>
        ) : data.canRequest ? (
          <RequestDialog item={{ ...item, type }} />
        ) : null}
        {request ? (
          <p className="text-sm text-muted-foreground">
            {m.media_requested_by({ name: request.requesterName })}
          </p>
        ) : null}
        {block?.reason ? (
          <p className="text-sm text-muted-foreground">
            {m.blocklist_reason_shown({ reason: block.reason })}
          </p>
        ) : null}
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
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <Badge variant="outline">
            {type === "ebook" ? m.media_type_ebook() : m.media_type_audiobook()}
          </Badge>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          {item.subtitle ? <p className="text-lg text-muted-foreground">{item.subtitle}</p> : null}
          {item.authorRefs && item.authorRefs.length > 0 ? (
            <p className="flex flex-wrap gap-x-1">
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
          <div className="flex flex-wrap gap-1">
            {item.series.map((series) => {
              const label = series.position
                ? m.media_series({ name: series.name, position: series.position })
                : m.media_series_no_position({ name: series.name });
              return series.id ? (
                <Link key={series.name} to="/series/$type/$id" params={{ type, id: series.id }}>
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
        </header>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {facts
            .filter((fact): fact is [string, string] => Boolean(fact[1]))
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
        {item.description ? (
          <p className="whitespace-pre-line text-sm leading-relaxed">{item.description}</p>
        ) : null}
        <TagList type={type} tags={item.tags ?? []} />
      </div>
    </article>
  );
}
