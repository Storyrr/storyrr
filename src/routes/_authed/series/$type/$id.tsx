import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { CollectionError } from "#/components/media/collection-page";
import { SeriesView } from "#/components/media/series-view";
import { isSearchableType } from "#/lib/media-types";
import { can } from "#/lib/permissions";
import { seriesQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/series/$type/$id")({
  beforeLoad: ({ params }) => {
    if (!isSearchableType(params.type)) throw notFound();
  },
  loader: ({ context, params }) =>
    isSearchableType(params.type)
      ? context.queryClient.ensureQueryData(seriesQuery(params.type, params.id))
      : undefined,
  head: () => ({ meta: [{ title: `${m.collection_series()} · ${m.app_name()}` }] }),
  component: SeriesPage,
});

function SeriesPage() {
  const { type, id } = Route.useParams();
  const { user } = Route.useRouteContext();
  if (!isSearchableType(type)) return null;
  return <SeriesContent type={type} id={id} canRequest={can(user, `request_${type}`)} />;
}

function SeriesContent({
  type,
  id,
  canRequest,
}: {
  type: "audiobook" | "ebook";
  id: string;
  canRequest: boolean;
}) {
  const { data } = useSuspenseQuery(seriesQuery(type, id));
  if (!data.ok)
    return (
      <CollectionError
        message={serviceErrorMessage(type === "ebook" ? "hardcover" : "audible", data.error)}
      />
    );
  return (
    <SeriesView
      type={type}
      id={id}
      name={data.name}
      description={data.description}
      items={data.results}
      collections={data.collections}
      acceptedLanguages={data.acceptedLanguages}
      canRequest={canRequest}
    />
  );
}
