import { createFileRoute } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import * as v from "valibot";

import { SearchResults } from "#/components/media/search-results";
import { SeriesResults } from "#/components/media/series-results";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { SEARCHABLE_TYPES } from "#/lib/media-types";
import { m } from "#/paraglide/messages.js";

/** Results of the top bar's search, across audiobooks and books. */
export const Route = createFileRoute("/_authed/search")({
  validateSearch: v.object({ q: v.optional(v.string()) }),
  head: () => ({ meta: [{ title: `${m.nav_search()} · ${m.app_name()}` }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q = "" } = Route.useSearch();
  const query = q.trim();
  if (query.length < 2) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle>{m.search_prompt_title()}</EmptyTitle>
          <EmptyDescription>{m.search_prompt_description()}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-semibold">{m.search_results_title({ query })}</h1>
      {SEARCHABLE_TYPES.map((type) => (
        <SearchResults key={type} type={type} query={query} titled />
      ))}
      <SeriesResults type="ebook" query={query} />
    </div>
  );
}
