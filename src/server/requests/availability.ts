import "@tanstack/react-start/server-only";
import { and, eq, inArray } from "drizzle-orm";

import type { AppDatabase } from "#/server/db/client";
import { media, request } from "#/server/db/schema";
import { ownedAsins } from "#/server/library";
import type { Services } from "#/server/services/factory";
import { hasBookFile } from "#/server/services/chaptarr/client";

import { transitionRequest } from "./transitions";

/**
 * Marks submitted audiobook requests available once Audiobookshelf holds the
 * ASIN (library index) or Chaptarr reports an imported file. Idempotent.
 * Pass `requestIds` to check only those (e.g. after a webhook).
 */
export async function checkAvailability(
  { db, services }: { db: AppDatabase; services: Services },
  { actor = "system", requestIds }: { actor?: string; requestIds?: string[] } = {},
): Promise<string[]> {
  const rows = db
    .select({
      id: request.id,
      format: request.format,
      backendRef: request.backendRef,
      asin: media.externalId,
    })
    .from(request)
    .innerJoin(media, eq(media.id, request.mediaId))
    .where(
      and(
        eq(request.status, "submitted"),
        eq(request.format, "audiobook"),
        requestIds ? inArray(request.id, requestIds) : undefined,
      ),
    )
    .all();
  if (rows.length === 0) return [];

  const owned = ownedAsins(
    db,
    rows.map((row) => row.asin),
  );
  const chaptarr = await services.chaptarr();
  const available: string[] = [];

  for (const row of rows) {
    let present = owned.has(row.asin.toUpperCase());
    const authorId = row.backendRef?.chaptarrAuthorId;
    const bookId = row.backendRef?.chaptarrBookId;
    if (!present && chaptarr && typeof authorId === "number" && typeof bookId === "number") {
      const file = await hasBookFile(chaptarr, { authorId, bookId });
      present = file.ok && file.value;
    }
    if (present) {
      transitionRequest(db, row.id, { to: "available", actor });
      available.push(row.id);
    }
  }
  return available;
}
