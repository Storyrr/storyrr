import "@tanstack/react-start/server-only";
import { Cron } from "croner";

import { db } from "#/server/db";
import { syncLibrary } from "#/server/library/sync";
import { checkAvailability } from "#/server/requests/availability";
import { failStuckRequests, submitApproved } from "#/server/requests/submit";
import { services } from "#/server/services";
import { settings } from "#/server/settings";

export type JobName = "library-sync" | "submit-approved";

type JobRun = { startedAt: Date; finishedAt?: Date; error?: string };

const jobs: Record<JobName, { pattern: string; run: () => Promise<void> }> = {
  /** Refresh the ownership index (every media server), then promote requests whose book arrived. */
  "library-sync": {
    pattern: "*/15 * * * *",
    run: async () => {
      // Each library is synced on its own: one being down doesn't block the other.
      const failures: string[] = [];
      for (const [service, label] of [
        ["audiobookshelf", "Audiobookshelf"],
        ["kavita", "Kavita"],
        ["komga", "Komga"],
        ["jellyfin", "Jellyfin"],
      ] as const) {
        const synced = await syncLibrary({ db, services, settings }, service);
        if (!synced.ok && synced.error.kind !== "not_configured")
          failures.push(`${label} sync: ${synced.error.message}`);
      }
      await checkAvailability({ db, services });
      await failStuckRequests({ db, services, settings });
      if (failures.length > 0) throw new Error(failures.join("; "));
    },
  },
  /** Safety net: approvals submit right away, this retries any left behind (e.g. after a restart). */
  "submit-approved": {
    pattern: "*/5 * * * *",
    run: async () => {
      await submitApproved({ db, services, settings });
    },
  },
};

const lastRuns = new Map<JobName, JobRun>();

/** Runs a job now (also used by "Check now"). Errors are logged, never thrown. */
export async function runJob(name: JobName): Promise<void> {
  const run: JobRun = { startedAt: new Date() };
  lastRuns.set(name, run);
  try {
    await jobs[name].run();
    console.info(`[jobs] ${name} done in ${Date.now() - run.startedAt.getTime()} ms`);
  } catch (error) {
    run.error = error instanceof Error ? error.message : String(error);
    console.error(`[jobs] ${name} failed: ${run.error}`);
  } finally {
    run.finishedAt = new Date();
  }
}

export function jobStatus(name: JobName): JobRun | undefined {
  return lastRuns.get(name);
}

export const JOB_NAMES: readonly JobName[] = ["library-sync", "submit-approved"];

/** Settings → Jobs: each job's schedule, last run and next run. */
export function listJobs() {
  return JOB_NAMES.map((name) => {
    const cron = globalThis.storyrrScheduler?.find((c) => c.name === name);
    const run = lastRuns.get(name);
    return {
      name,
      pattern: jobs[name].pattern,
      running: run !== undefined && run.finishedAt === undefined,
      lastRun: run ? { ...run } : null,
      nextRun: cron?.nextRun() ?? null,
    };
  });
}

declare global {
  // Survives dev HMR re-evaluating this module, so jobs are scheduled once per process.
  var storyrrScheduler: Cron[] | undefined;
}

/** Schedules every job once per process (`protect` skips a run while the previous one is busy). */
export function startScheduler(): void {
  if (globalThis.storyrrScheduler) return;
  globalThis.storyrrScheduler = JOB_NAMES.map(
    (name) => new Cron(jobs[name].pattern, { name, protect: true }, () => runJob(name)),
  );
}
