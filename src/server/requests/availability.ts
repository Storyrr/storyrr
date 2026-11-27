import "@tanstack/react-start/server-only";
import { and, eq, inArray } from "drizzle-orm";

import { isSearchableType, SEARCHABLE_TYPES } from "#/lib/media-types";
import type { AppDatabase } from "#/server/db/client";
import { chaptarrHoldsBook } from "#/server/library";
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

/**
 * Marks delivered requests removed once their book is gone: no library holds
 * it any more, and Chaptarr has no file of it. The title can then be requested
 * again (like Seerr's "deleted" media). Run after a library sync that worked:
 * an index that couldn't be refreshed says nothing about deletions. A book
 * Chaptarr can't be asked about right now is left alone.
 */
export async function removeDeleted(
  { db, services }: { db: AppDatabase; services: Services },
  { actor = "system" }: { actor?: string } = {},
): Promise<string[]> {
  const rows = db
    .select({
      id: request.id,
      format: request.format,
      source: media.source,
      externalId: media.externalId,
      title: media.title,
      series: media.series,
      backendRef: request.backendRef,
    })
    .from(request)
    .innerJoin(media, eq(media.id, request.mediaId))
    .where(and(eq(request.status, "available"), inArray(request.format, SEARCHABLE_TYPES)))
    .all();
  const chaptarr = rows.length > 0 ? await services.chaptarr() : null;
  const removed: string[] = [];

  for (const row of rows) {
    if (!isSearchableType(row.format)) continue;
    const bookId = row.backendRef?.chaptarrBookId;
    if (typeof bookId === "number" && chaptarrHoldsBook(db, bookId)) continue;
    if (mediaSources[row.format].owned(db, [row]).has(row.externalId)) continue;
    // The index doesn't know it: ask Chaptarr itself before giving the book up
    // (its local book ids change, and it may know the book under another ID).
    const providerId = chaptarrProviderId(row.source, row.externalId);
    if (chaptarr && providerId) {
      const file = await hasBookFile(chaptarr, { term: providerId, media: row.format });
      if (!file.ok || file.value) continue;
    }
    try {
      transitionRequest(db, row.id, { to: "removed", actor });
      removed.push(row.id);
    } catch (error) {
      if (!(error instanceof InvalidTransitionError || error instanceof RequestNotFoundError))
        throw error;
    }
  }
  return removed;
}
