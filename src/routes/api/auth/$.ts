import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/server/auth";
import { isBlockedAuthPath } from "#/server/auth/blocked-paths";

const handle = (request: Request) =>
  isBlockedAuthPath(request.url)
    ? new Response("Not Found", { status: 404 })
    : auth.handler(request);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
