import "@tanstack/react-start/server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { MediaDetails, MediaSummary } from "#/lib/media";
import {
  ACTIVE_REQUEST_STATUSES,
  type MediaType,
  type RequestFilter,
  type RequestSort,
  type RequestStatus,
} from "#/lib/requests";
import type { AppDatabase } from "#/server/db/client";
import { media, request, requestEvent, requestWatcher, user } from "#/server/db/schema";

/** Saves (or refreshes) provider metadata and returns the local media id. */
export function upsertMedia(
  db: AppDatabase,
  item: MediaDetails | MediaSummary,
  now = new Date(),
): string {
  const values = {
    type: item.type,
    source: item.source,
    externalId: item.externalId,
    title: item.title,
    authors: item.authors,
    narrators: item.narrators,
    series: item.series,
    language: item.language ?? null,
    coverUrl: item.coverUrl ?? null,
    metadata: { ...item },
    fetchedAt: now,
  };
  return db
    .insert(media)
    .values(values)
    .onConflictDoUpdate({ target: [media.source, media.externalId], set: values })
    .returning({ id: media.id })
    .get().id;
}

export type ActiveRequestInfo = { requestId: string; status: RequestStatus; requesterName: string };

/** The active request (any target) for each external id of one source and format. */
export function activeRequestsByExternalId(
  db: AppDatabase,
  { source, format, externalIds }: { source: string; format: MediaType; externalIds: string[] },
): Map<string, ActiveRequestInfo> {
  if (externalIds.length === 0) return new Map();
  const rows = db
    .select({
      externalId: media.externalId,
      requestId: request.id,
      status: request.status,
      requesterName: user.name,
    })
    .from(request)
    .innerJoin(media, eq(media.id, request.mediaId))
    .innerJoin(user, eq(user.id, request.userId))
    .where(
      and(
        eq(media.source, source),
        inArray(media.externalId, externalIds),
        eq(request.format, format),
        inArray(request.status, ACTIVE_REQUEST_STATUSES),
      ),
    )
    .orderBy(desc(request.createdAt))
    .all();
  const byId = new Map<string, ActiveRequestInfo>();
  for (const row of rows) if (!byId.has(row.externalId)) byId.set(row.externalId, row);
  return byId;
}

const filterStatuses: Record<Exclude<RequestFilter, "all">, RequestStatus[]> = {
  pending: ["pending"],
  processing: ["approved", "submitted"],
  available: ["available"],
  declined: ["denied"],
  failed: ["failed"],
  cancelled: ["cancelled"],
};

export type RequestListOptions = {
  /** Requests of (or watched by) this user; all when unset. */
  userId?: string;
  filter: RequestFilter;
  format?: MediaType;
  sort?: RequestSort;
  order?: "asc" | "desc";
};

/** Requests with their media and requester; by default pending first, then newest. */
export function listRequests(
  db: AppDatabase,
  { userId, filter, format, sort = "status", order = "desc" }: RequestListOptions,
) {
  const direction = order === "asc" ? asc : desc;
  const statuses = filter === "all" ? undefined : filterStatuses[filter];
  const rows = db
    .select({
      id: request.id,
      status: request.status,
      format: request.format,
      target: request.target,
      qualityProfileId: request.qualityProfileId,
      lastError: request.lastError,
      backendRef: request.backendRef,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      requester: { id: user.id, name: user.name },
      media: {
        type: media.type,
        source: media.source,
        externalId: media.externalId,
        title: media.title,
        authors: media.authors,
        coverUrl: media.coverUrl,
        /** Stored with the provider's details (ISO date), when it had one. */
        releaseDate: sql<string | null>`json_extract(${media.metadata}, '$.releaseDate')`,
      },
      watchers:
        sql`(select count(*) from ${requestWatcher} where ${requestWatcher.requestId} = ${request.id})`.mapWith(
          Number,
        ),
    })
    .from(request)
    .innerJoin(media, eq(media.id, request.mediaId))
    .innerJoin(user, eq(user.id, request.userId))
    .where(
      and(
        userId
          ? sql`(${request.userId} = ${userId} or exists (select 1 from ${requestWatcher} where ${requestWatcher.requestId} = ${request.id} and ${requestWatcher.userId} = ${userId}))`
          : undefined,
        statuses ? inArray(request.status, statuses) : undefined,
        format ? eq(request.format, format) : undefined,
      ),
    )
    .orderBy(
      ...(sort === "status"
        ? [sql`case when ${request.status} = 'pending' then 0 else 1 end`, desc(request.createdAt)]
        : // The id breaks ties between requests made in the same millisecond.
          [
            direction(sort === "added" ? request.createdAt : request.updatedAt),
            direction(request.id),
          ]),
    )
    .all();
  // Sent, but Chaptarr only queued it (author metadata not ready): not downloading yet.
  return rows.map(({ backendRef, ...row }) => ({
    ...row,
    waitingForChaptarr: row.status === "submitted" && backendRef?.chaptarrBookId === undefined,
  }));
}

export type RequestListItem = ReturnType<typeof listRequests>[number];

export function requestHistory(db: AppDatabase, requestId: string) {
  return db
    .select({
      actor: requestEvent.actor,
      actorName: user.name,
      fromStatus: requestEvent.fromStatus,
      toStatus: requestEvent.toStatus,
      message: requestEvent.message,
      createdAt: requestEvent.createdAt,
    })
    .from(requestEvent)
    .leftJoin(user, eq(user.id, requestEvent.actor))
    .where(eq(requestEvent.requestId, requestId))
    .orderBy(requestEvent.createdAt)
    .all();
}

export function getRequestRow(db: AppDatabase, requestId: string) {
  return db.select().from(request).where(eq(request.id, requestId)).get();
}

export function countPending(db: AppDatabase): number {
  return (
    db
      .select({ count: sql`count(*)`.mapWith(Number) })
      .from(request)
      .where(eq(request.status, "pending"))
      .get()?.count ?? 0
  );
}
