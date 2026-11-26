import "@tanstack/react-start/server-only";
import { and, eq, inArray } from "drizzle-orm";

import { isSearchableType, SEARCHABLE_TYPES } from "#/lib/media-types";
import type { AppDatabase } from "#/server/db/client";
import { media, request } from "#/server/db/schema";
import type { Services } from "#/server/services/factory";
import { hasBookFile } from "#/server/services/chaptarr/client";
import { chaptarrProviderId, mediaSources } from "#/server/sources";

import { InvalidTransitionError, RequestNotFoundError, transitionRequest } from "./transitions";

/** `backendRef` flag: a library already held this title (by title alone) when the request was sent. */
export const OWNED_AT_SUBMIT = "ownedAtSubmit";

/**
 * Marks submitted requests available once a library holds the book
 * (Audiobookshelf by ASIN, the others by title, unless that title was already
 * there when the request was sent) or Chaptarr reports a file for it (by
 * provider ID). Idempotent, and safe to run concurrently. Pass `requestIds` to check only those (e.g.
 * after a webhook).
 */
export async function checkAvailability(
  { db, services }: { db: AppDatabase; services: Services },
  { actor = "system", requestIds }: { actor?: string; requestIds?: string[] } = {},
): Promise<string[]> {
  const rows = db
    .select({
      id: request.id,
      format: request.format,
      source: media.source,
      externalId: media.externalId,
      title: media.title,
      backendRef: request.backendRef,
    })
    .from(request)
    .innerJoin(media, eq(media.id, request.mediaId))
    .where(
      and(
        eq(request.status, "submitted"),
        inArray(request.format, SEARCHABLE_TYPES),
        requestIds ? inArray(request.id, requestIds) : undefined,
      ),
    )
    .all();
  if (rows.length === 0) return [];

  const chaptarr = await services.chaptarr();
  const available: string[] = [];

  for (const row of rows) {
    if (!isSearchableType(row.format)) continue;
    // A title a library already held when the request was sent proves nothing:
    // it is another book with the same title, or the copy the user wants replaced.
    const exact = row.backendRef?.[OWNED_AT_SUBMIT] === 1;
    let present = mediaSources[row.format].owned(db, [row], { exact }).has(row.externalId);
    const providerId = chaptarrProviderId(row.source, row.externalId);
    if (!present && chaptarr && providerId) {
      const file = await hasBookFile(chaptarr, { term: providerId, media: row.format });
      present = file.ok && file.value;
    }
    if (!present) continue;
    try {
      transitionRequest(db, row.id, { to: "available", actor });
      available.push(row.id);
    } catch (error) {
      // Changed while Chaptarr was answering (another check, a deletion): nothing to do.
      if (!(error instanceof InvalidTransitionError || error instanceof RequestNotFoundError))
        throw error;
    }
  }
  return available;
}
