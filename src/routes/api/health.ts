import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/server/db";
import { checkHealth } from "#/server/health";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        const report = checkHealth(db);
        return Response.json(report, {
          status: report.status === "ok" ? 200 : 503,
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
