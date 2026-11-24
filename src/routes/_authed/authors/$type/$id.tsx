import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import * as v from "valibot";

import { CollectionError, CollectionPage } from "#/components/media/collection-page";
import { isSearchableType } from "#/lib/media-types";
import { authorQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/authors/$type/$id")({
  // Audible finds an author's books by name: the link carries it.
  validateSearch: v.object({ name: v.optional(v.string(), "") }),
  beforeLoad: ({ params }) => {
    if (!isSearchableType(params.type)) throw notFound();
  },
  loaderDeps: ({ search }) => ({ name: search.name }),
  loader: ({ context, params, deps }) =>
    isSearchableType(params.type)
      ? context.queryClient.ensureQueryData(authorQuery(params.type, params.id, deps.name))
      : undefined,
  head: () => ({ meta: [{ title: `${m.collection_author()} · ${m.app_name()}` }] }),
  component: AuthorPage,
});

function AuthorPage() {
  const { type, id } = Route.useParams();
  const { name } = Route.useSearch();
  if (!isSearchableType(type)) return null;
  return <AuthorContent type={type} id={id} name={name} />;
}

function AuthorContent({
  type,
  id,
  name,
}: {
  type: "audiobook" | "ebook";
  id: string;
  name: string;
}) {
  const { data } = useSuspenseQuery(authorQuery(type, id, name));
  if (!data.ok)
    return (
      <CollectionError
        message={serviceErrorMessage(type === "ebook" ? "hardcover" : "audible", data.error)}
      />
    );
  return (
    <CollectionPage
      type={type}
      kicker={m.collection_author()}
      name={data.name}
      description={data.description}
      imageUrl={data.imageUrl}
      items={data.results}
      acceptedLanguages={data.acceptedLanguages}
    />
  );
}
