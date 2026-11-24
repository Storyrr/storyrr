import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { FormError } from "#/components/form/form-error";
import { MediaCard } from "#/components/media/media-card";
import { Skeleton } from "#/components/ui/skeleton";
import type { SearchableType } from "#/lib/media-types";
import { mediaSearchQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

export const sectionTitles: Record<SearchableType, () => string> = {
  audiobook: m.search_tab_audiobooks,
  ebook: m.search_tab_books,
};
const providers: Record<SearchableType, "audible" | "hardcover"> = {
  audiobook: "audible",
  ebook: "hardcover",
};

/** Search results for one type, as a grid of cards (with a heading when several types are shown). */
export function SearchResults({
  type,
  query,
  titled,
}: {
  type: SearchableType;
  query: string;
  titled: boolean;
}) {
  const search = useQuery(mediaSearchQuery(type, query));
  const headingId = useId();

  let body: React.ReactNode;
  if (search.isPending) {
    body = <ResultsSkeleton />;
  } else if (search.isError) {
    body = <FormError message={search.error.message || m.error_generic()} />;
  } else if (!search.data.ok) {
    body = <FormError message={serviceErrorMessage(providers[type], search.data.error)} />;
  } else if (search.data.results.length === 0) {
    body = <p className="text-muted-foreground">{m.search_no_results({ query })}</p>;
  } else {
    const { results, acceptedLanguages } = search.data;
    body = (
      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        aria-busy={search.isFetching}
      >
        {results.map((item) => (
          <li key={item.externalId}>
            <MediaCard type={type} item={item} acceptedLanguages={acceptedLanguages} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={titled ? headingId : undefined}>
      {titled ? (
        <h2 id={headingId} className="text-lg font-semibold">
          {sectionTitles[type]()}
        </h2>
      ) : null}
      {body}
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="aspect-square w-full" />
      ))}
    </div>
  );
}
