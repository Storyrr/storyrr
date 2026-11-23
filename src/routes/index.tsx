import { createFileRoute } from "@tanstack/react-router";

import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold">{m.home_title()}</h1>
      <p className="mt-4 text-lg">{m.home_tagline()}</p>
    </div>
  );
}
