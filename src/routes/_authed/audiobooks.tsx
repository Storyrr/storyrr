import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { ExplorePage } from "#/components/media/explore-page";
import { AudiobookFiltersSchema, readFilters, type AudiobookFilters } from "#/lib/explore";
import { m } from "#/paraglide/messages.js";

/** Seerr's Movies / Series page for this format: the catalog with a sort and filters. */
export const Route = createFileRoute("/_authed/audiobooks")({
  // No defaults: the router would rewrite the URL with them on every visit.
  validateSearch: (search: Record<string, unknown>) => readFilters(AudiobookFiltersSchema, search),
  head: () => ({ meta: [{ title: `${m.nav_audiobooks()} · ${m.app_name()}` }] }),
  component: Page,
});

function Page() {
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onChange = useCallback(
    (next: AudiobookFilters) => void navigate({ search: next, replace: true }),
    [navigate],
  );
  return (
    <ExplorePage
      type="audiobook"
      title={m.nav_audiobooks()}
      filters={filters}
      onChange={onChange}
    />
  );
}
