import "@tanstack/react-start/server-only";
import { sql } from "drizzle-orm";

import type { AppDatabase } from "#/server/db/client";
import { APP_VERSION } from "#/server/version";

export type HealthReport = {
  status: "ok" | "error";
  version: string;
  checks: { database: "ok" | "error" };
};

/**
 * Liveness/readiness for the container healthcheck. Public: reports states
 * only, never error details, hostnames or credentials. Per-service checks
 * (Chaptarr, Audiobookshelf, Kavita) are added with their integrations.
 */
export function checkHealth(db: AppDatabase): HealthReport {
  let database: "ok" | "error" = "ok";
  try {
    db.run(sql`select 1`);
  } catch {
    database = "error";
  }
  return {
    status: database === "ok" ? "ok" : "error",
    version: APP_VERSION,
    checks: { database },
  };
}
