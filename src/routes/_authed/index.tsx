import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import * as v from "valibot";

import { FormError } from "#/components/form/form-error";
import { MediaCard } from "#/components/media/media-card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "#/components/ui/input-group";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { useDebouncedValue } from "#/hooks/use-debounced-value";
import type { searchAudiobooks } from "#/functions/media.functions";
import { audiobookSearchQuery } from "#/lib/queries/media";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/")({
  validateSearch: v.object({ q: v.optional(v.string()) }),
  head: () => ({ meta: [{ title: `${m.nav_search()} · ${m.app_name()}` }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [input, setInput] = useState(q);
  const query = useDebouncedValue(input.trim(), 350);
  const inputId = useId();

  // Keep the URL in sync (shareable, back button) without a history entry per keystroke.
  useEffect(() => {
    if (query !== q) void navigate({ search: { q: query || undefined }, replace: true });
  }, [query, q, navigate]);

  const search = useQuery(audiobookSearchQuery(query));

  return (
    <div className="flex flex-col gap-6">
      <search>
        <form onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-2">
          <Label htmlFor={inputId} className="sr-only">
            {m.search_label()}
          </Label>
          <InputGroup className="h-11">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id={inputId}
              type="search"
              placeholder={m.search_placeholder()}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              autoComplete="off"
            />
          </InputGroup>
        </form>
      </search>
      <SearchResults query={query} search={search} />
    </div>
  );
}

function SearchResults({
  query,
  search,
}: {
  query: string;
  search: UseQueryResult<Awaited<ReturnType<typeof searchAudiobooks>>>;
}) {
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
  if (search.isPending) return <ResultsSkeleton />;
  if (search.isError) return <FormError message={search.error.message || m.error_generic()} />;
  if (!search.data.ok)
    return <FormError message={m.search_failed({ message: search.data.error.message })} />;
  if (search.data.results.length === 0) {
    return <p className="text-muted-foreground">{m.search_no_results({ query })}</p>;
  }
  return (
    <ul
      className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      aria-busy={search.isFetching}
    >
      {search.data.results.map((item) => (
        <li key={item.externalId}>
          <MediaCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} className="aspect-square w-full" />
      ))}
    </div>
  );
}
