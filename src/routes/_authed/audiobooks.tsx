import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import * as v from "valibot";

import { TrendingRow } from "#/components/media/trending-row";
import { TypeSearch } from "#/components/media/type-search";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/audiobooks")({
  validateSearch: v.object({ q: v.optional(v.string()) }),
  head: () => ({ meta: [{ title: `${m.nav_audiobooks()} · ${m.app_name()}` }] }),
  component: Page,
});

function Page() {
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const setQuery = useCallback(
    (query: string) => void navigate({ search: { q: query || undefined }, replace: true }),
    [navigate],
  );
  return (
    <TypeSearch
      type="audiobook"
      title={m.nav_audiobooks()}
      placeholder={m.search_placeholder_audiobooks()}
      query={q}
      onQueryChange={setQuery}
      browse={<TrendingRow type="audiobook" />}
    />
  );
}
