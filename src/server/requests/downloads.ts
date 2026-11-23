import "@tanstack/react-start/server-only";

import type { Services } from "#/server/services/factory";
import { downloadQueue, type QueueItem } from "#/server/services/chaptarr/client";

export type DownloadInfo = { progress: number | null; state: string | null };

const TTL_MS = 15_000;
let cached: { at: number; items: QueueItem[] } | undefined;

/** Chaptarr's queue, shared briefly between the polls of every open Requests page. */
async function queue(services: Services, now: number): Promise<QueueItem[] | null> {
  if (cached && now - cached.at < TTL_MS) return cached.items;
  const chaptarr = await services.chaptarr();
  if (!chaptarr) return null;
  const result = await downloadQueue(chaptarr);
  if (!result.ok) return cached?.items ?? null;
  cached = { at: now, items: result.value };
  return result.value;
}

export type SentRequest = {
  id: string;
  format: string;
  backendRef: Record<string, string | number> | null;
};

/**
 * Which sent requests Chaptarr is actually downloading (matched by provider ID,
 * then by local book id), with their progress. A request missing from the map
 * is sent but not downloading: nothing grabbed yet.
 */
export async function downloadsFor(
  services: Services,
  requests: readonly SentRequest[],
  now = Date.now(),
): Promise<Map<string, DownloadInfo>> {
  const result = new Map<string, DownloadInfo>();
  if (requests.length === 0) return result;
  const items = await queue(services, now);
  if (!items) return result;
  for (const req of requests) {
    const foreignBookId = req.backendRef?.chaptarrForeignBookId;
    const bookId = req.backendRef?.chaptarrBookId;
    const item = items.find(
      (i) =>
        (typeof foreignBookId === "string" &&
          i.foreignBookId === foreignBookId &&
          (!i.media || i.media === req.format)) ||
        (typeof bookId === "number" && i.bookId === bookId),
    );
    if (item) result.set(req.id, { progress: item.progress, state: item.state });
  }
  return result;
}

export function clearDownloadsCache(): void {
  cached = undefined;
}
