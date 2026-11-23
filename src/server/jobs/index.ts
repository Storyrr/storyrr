import "@tanstack/react-start/server-only";
import { Cron } from "croner";

import { db } from "#/server/db";
import { syncAudiobookshelf, syncKavita } from "#/server/library";
import { checkAvailability } from "#/server/requests/availability";
import { submitApproved } from "#/server/requests/submit";
import { services } from "#/server/services";
import { settings } from "#/server/settings";

export type JobName = "library-sync" | "submit-approved";

type JobRun = { startedAt: Date; finishedAt?: Date; error?: string };

const jobs: Record<JobName, { pattern: string; run: () => Promise<void> }> = {
  /** Refresh the ownership index (Audiobookshelf, Kavita), then promote requests whose book arrived. */
  "library-sync": {
    pattern: "*/15 * * * *",
    run: async () => {
      // Each library is synced on its own: one being down doesn't block the other.
      const failures: string[] = [];
      const abs = await services.audiobookshelf();
      if (abs) {
        const synced = await syncAudiobookshelf(db, abs);
        if (!synced.ok) failures.push(`Audiobookshelf sync: ${synced.error.message}`);
      }
      const kavita = await services.kavita();
      if (kavita) {
        const synced = await syncKavita(db, kavita);
        if (!synced.ok) failures.push(`Kavita sync: ${synced.error.message}`);
      }
      await checkAvailability({ db, services });
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

declare global {
  // Survives dev HMR re-evaluating this module, so jobs are scheduled once per process.
  var storyrrScheduler: Cron[] | undefined;
}

/** Schedules every job once per process (`protect` skips a run while the previous one is busy). */
export function startScheduler(): void {
  if (globalThis.storyrrScheduler) return;
  const names: JobName[] = ["library-sync", "submit-approved"];
  globalThis.storyrrScheduler = names.map(
    (name) => new Cron(jobs[name].pattern, { name, protect: true }, () => runJob(name)),
  );
}
