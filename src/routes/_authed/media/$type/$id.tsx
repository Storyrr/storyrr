import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { FormError } from "#/components/form/form-error";
import { AvailabilityBadge } from "#/components/media/availability-badge";
import { Cover } from "#/components/media/cover";
import { RequestDialog } from "#/components/media/request-dialog";
import { Badge } from "#/components/ui/badge";
import { formatDate, formatDuration, formatList } from "#/lib/format";
import { audiobookQuery } from "#/lib/queries/media";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/media/$type/$id")({
  // Only audiobooks so far (eBooks and podcasts come with milestones 3 and 4).
  beforeLoad: ({ params }) => {
    if (params.type !== "audiobook") throw notFound();
  },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(audiobookQuery(params.id)),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.ok ? `${loaderData.item.title} · ${m.app_name()}` : m.app_name() }],
  }),
  component: MediaPage,
});

function MediaPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(audiobookQuery(id));

  if (!data.ok) {
    return (
      <FormError
        message={
          data.error.kind === "not_found"
            ? m.media_not_found()
            : m.media_load_failed({ message: data.error.message })
        }
      />
    );
  }
  const { item, availability, request } = data;
  const facts: [string, string | undefined][] = [
    [m.media_duration(), item.durationMinutes ? formatDuration(item.durationMinutes) : undefined],
    [m.media_release_date(), item.releaseDate ? formatDate(item.releaseDate) : undefined],
    [m.media_language(), item.language],
    [m.media_publisher(), item.publisher],
  ];

  return (
    <article className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <div className="flex flex-col gap-3">
        <Cover src={item.coverUrl} className="w-full max-w-64" />
        {availability === "none" ? (
          <RequestDialog item={item} />
        ) : (
          <AvailabilityBadge availability={availability} />
        )}
        {request ? (
          <p className="text-sm text-muted-foreground">
            {m.media_requested_by({ name: request.requesterName })}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <Badge variant="outline">{m.media_type_audiobook()}</Badge>
          <h1 className="text-2xl font-semibold">{item.title}</h1>
          {item.subtitle ? <p className="text-lg text-muted-foreground">{item.subtitle}</p> : null}
          {item.authors.length > 0 ? (
            <p>{m.media_by({ authors: formatList(item.authors) })}</p>
          ) : null}
          {item.narrators.length > 0 ? (
            <p className="text-muted-foreground">
              {m.media_narrated_by({ narrators: formatList(item.narrators) })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {item.series.map((series) => (
              <Badge key={series.name} variant="secondary">
                {series.position
                  ? m.media_series({ name: series.name, position: series.position })
                  : m.media_series_no_position({ name: series.name })}
              </Badge>
            ))}
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
      </div>
    </article>
  );
}
