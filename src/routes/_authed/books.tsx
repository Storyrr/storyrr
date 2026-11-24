import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { ExplorePage } from "#/components/media/explore-page";
import { BookFiltersSchema, readFilters, type BookFilters } from "#/lib/explore";
import { m } from "#/paraglide/messages.js";

/** Seerr's Movies / Series page for this format: the catalog with a sort and filters. */
export const Route = createFileRoute("/_authed/books")({
  // No defaults: the router would rewrite the URL with them on every visit.
  validateSearch: (search: Record<string, unknown>) => readFilters(BookFiltersSchema, search),
  head: () => ({ meta: [{ title: `${m.nav_books()} · ${m.app_name()}` }] }),
  component: Page,
});

function Page() {
  const filters = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onChange = useCallback(
    (next: BookFilters) => void navigate({ search: next, replace: true }),
    [navigate],
  );
  return <ExplorePage type="ebook" title={m.nav_books()} filters={filters} onChange={onChange} />;
}
