import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { Key } from "react-aria-components";
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
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { useDebouncedValue } from "#/hooks/use-debounced-value";
import { SEARCHABLE_TYPES, type SearchableType } from "#/lib/media-types";
import { mediaSearchQuery } from "#/lib/queries/media";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

const TABS = ["all", ...SEARCHABLE_TYPES] as const;
type Tab = (typeof TABS)[number];

const tabLabels: Record<Tab, () => string> = {
  all: m.search_tab_all,
  audiobook: m.search_tab_audiobooks,
  ebook: m.search_tab_books,
};
const sectionTitles: Record<SearchableType, () => string> = {
  audiobook: m.search_tab_audiobooks,
  ebook: m.search_tab_books,
};
const providers: Record<SearchableType, "audible" | "hardcover"> = {
  audiobook: "audible",
  ebook: "hardcover",
};

export const Route = createFileRoute("/_authed/")({
  validateSearch: v.object({ q: v.optional(v.string()), type: v.optional(v.picklist(TABS)) }),
  head: () => ({ meta: [{ title: `${m.nav_search()} · ${m.app_name()}` }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q = "", type: tab = "all" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [input, setInput] = useState(q);
  const query = useDebouncedValue(input.trim(), 350);
  const inputId = useId();

  // Keep the URL in sync (shareable, back button) without a history entry per keystroke.
  useEffect(() => {
    if (query !== q)
      void navigate({ search: (prev) => ({ ...prev, q: query || undefined }), replace: true });
  }, [query, q, navigate]);

  const types = tab === "all" ? SEARCHABLE_TYPES : [tab];

  return (
    <div className="flex flex-col gap-6">
      <search className="flex flex-col gap-3">
        <form onSubmit={(event) => event.preventDefault()}>
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
        <ToggleGroup
          aria-label={m.search_type_label()}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[tab]}
          onSelectionChange={(keys: Set<Key>) => {
            const next = TABS.find((t) => keys.has(t));
            if (next)
              void navigate({
                search: (prev) => ({ ...prev, type: next === "all" ? undefined : next }),
              });
          }}
          variant="outline"
        >
          {TABS.map((t) => (
            <ToggleGroupItem key={t} id={t}>
              {tabLabels[t]()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </search>
      {query.length < 2 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>{m.search_prompt_title()}</EmptyTitle>
            <EmptyDescription>{m.search_prompt_description()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        types.map((type) => (
          <SearchResults key={type} type={type} query={query} titled={types.length > 1} />
        ))
      )}
    </div>
  );
}

function SearchResults({
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
    body = (
      <ul
        className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        aria-busy={search.isFetching}
      >
        {search.data.results.map((item) => (
          <li key={item.externalId}>
            <MediaCard type={type} item={item} />
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
