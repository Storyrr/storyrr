import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRightIcon, SearchIcon } from "lucide-react";
import type { Key } from "react-aria-components";
import * as v from "valibot";

import { SearchResults, sectionTitles, useSearchEntries } from "#/components/media/search-results";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { SEARCHABLE_TYPES, type SearchableType } from "#/lib/media-types";
import { m } from "#/paraglide/messages.js";

const TABS = ["all", ...SEARCHABLE_TYPES] as const;
type Tab = (typeof TABS)[number];

/**
 * Results of the top bar's search: a preview row per format ("All"), or one
 * format's full grid. The tab lives in the URL.
 */
export const Route = createFileRoute("/_authed/search")({
  validateSearch: v.object({ q: v.optional(v.string()), tab: v.optional(v.picklist(TABS)) }),
  head: () => ({ meta: [{ title: `${m.nav_search()} · ${m.app_name()}` }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q = "", tab = "all" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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
  const select = (next: Tab) =>
    void navigate({ search: { q, tab: next === "all" ? undefined : next }, replace: true });
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">{m.search_results_title({ query })}</h1>
      <ToggleGroup
        aria-label={m.nav_search()}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[tab]}
        onSelectionChange={(keys: Set<Key>) => {
          const next = TABS.find((t) => keys.has(t));
          if (next) select(next);
        }}
        variant="outline"
        className="flex-wrap"
      >
        <ToggleGroupItem id="all">{m.search_tab_all()}</ToggleGroupItem>
        {SEARCHABLE_TYPES.map((type) => (
          <ToggleGroupItem key={type} id={type}>
            <TabLabel type={type} query={query} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {tab === "all" ? (
        // Both formats at a glance: one row each, its full grid one click away.
        <div className="flex flex-col gap-8">
          {SEARCHABLE_TYPES.map((type) => (
            <SearchResults
              key={type}
              type={type}
              query={query}
              layout="row"
              action={
                <Link
                  to="/search"
                  search={{ q, tab: type }}
                  replace
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  {m.discover_see_all()}
                  <ArrowRightIcon className="size-4" aria-hidden />
                </Link>
              }
            />
          ))}
        </div>
      ) : (
        <SearchResults type={tab} query={query} layout="grid" />
      )}
    </div>
  );
}

/** "Books (31)": the format with how many results it has, once known. */
function TabLabel({ type, query }: { type: SearchableType; query: string }) {
  const { search, entries } = useSearchEntries(type, query);
  const label = sectionTitles[type]();
  return search.data?.ok ? m.search_tab_count({ label, count: entries.length }) : label;
}
