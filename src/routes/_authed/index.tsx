import { createFileRoute } from "@tanstack/react-router";

import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/")({ component: Home });

function Home() {
  const { user } = Route.useRouteContext();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{m.home_title({ name: user.name })}</h1>
      <p className="text-muted-foreground">{m.home_tagline()}</p>
    </div>
  );
}
