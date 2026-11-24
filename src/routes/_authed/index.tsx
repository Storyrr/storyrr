import { createFileRoute } from "@tanstack/react-router";

import { m } from "#/paraglide/messages.js";

/** Discover: rows to browse (filled in by the next commits). */
export const Route = createFileRoute("/_authed/")({
  head: () => ({ meta: [{ title: `${m.nav_discover()} · ${m.app_name()}` }] }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const { user } = Route.useRouteContext();
  return <h1 className="text-3xl font-semibold">{m.discover_welcome({ name: user.name })}</h1>;
}
