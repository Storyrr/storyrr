import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { TagIcon } from "lucide-react";

import { FormError } from "#/components/form/form-error";
import { MediaCard } from "#/components/media/media-card";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { isSearchableType, type SearchableType } from "#/lib/media-types";
import { taggedPagesQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

/** A genre or keyword (Seerr's keyword page): its most popular titles, page by page. */
export const Route = createFileRoute("/_authed/tags/$type/$id")({
  beforeLoad: ({ params }) => {
    if (!isSearchableType(params.type)) throw notFound();
  },
  head: () => ({ meta: [{ title: `${m.tag_page_title()} · ${m.app_name()}` }] }),
  component: TagPage,
});

function TagPage() {
  const { type, id } = Route.useParams();
  if (!isSearchableType(type)) return null;
  return <TagList type={type} id={id} />;
}

function TagList({ type, id }: { type: SearchableType; id: string }) {
  const pages = useInfiniteQuery(taggedPagesQuery(type, id));
  const first = pages.data?.pages[0];
  const seen = new Set<string>();
  const items = (pages.data?.pages ?? [])
    .flatMap((page) => (page.ok ? page.results : []))
    .filter((item) => !seen.has(item.externalId) && seen.add(item.externalId));
  const acceptedLanguages = first?.ok ? first.acceptedLanguages : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <TagIcon className="size-4" aria-hidden />
          {type === "audiobook" ? m.tag_page_audiobooks() : m.tag_page_books()}
        </p>
        <h1 className="text-2xl font-semibold">
          {first?.ok ? first.name : pages.isPending ? <Skeleton className="h-8 w-48" /> : null}
        </h1>
      </div>
      {pages.isPending ? <Skeleton className="h-64 w-full" /> : null}
      {first && !first.ok ? (
        <FormError
          message={serviceErrorMessage(type === "ebook" ? "hardcover" : "audible", first.error)}
        />
      ) : null}
      {first?.ok && items.length === 0 ? (
        <p className="text-muted-foreground">{m.collection_empty()}</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item) => (
          <li key={item.externalId}>
            <MediaCard type={type} item={item} acceptedLanguages={acceptedLanguages} />
          </li>
        ))}
      </ul>
      {pages.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          isDisabled={pages.isFetchingNextPage}
          onPress={() => void pages.fetchNextPage()}
        >
          {pages.isFetchingNextPage ? <Spinner data-icon="inline-start" /> : null}
          {m.browse_load_more()}
        </Button>
      ) : null}
    </div>
  );
}
