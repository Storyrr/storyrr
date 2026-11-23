import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { FetchFn, ServiceResult } from "#/server/services/result";
import { fail, ok, requestJson } from "#/server/services/result";

import {
  BookImportResponseSchema,
  BookSchema,
  HealthItemSchema,
  PendingImportSchema,
  QueuePageSchema,
  ProfileSchema,
  RootFolderSchema,
  SystemStatusSchema,
  type Book,
} from "./schemas";

export type ChaptarrConnection = { url: string; apiKey: string };
export type ChaptarrMedia = "audiobook" | "ebook";

/** Body of `POST /book/import` (Chaptarr's request-one-book endpoint for automation). */
export type BookImportRequest = {
  foreignBookId: string;
  foreignAuthorId: string;
  authorName?: string;
  mediaType: ChaptarrMedia;
  rootFolder: string;
  qualityProfileId: number;
  metadataProfileId: number;
  authorMonitoring: {
    /** The author's other books: "none" keeps them unmonitored; the requested book is monitored anyway. */
    monitor: "none";
    /** Search for exactly this book (delayed until the author's metadata is ready if needed). */
    searchForMissing: boolean;
  };
};

/** Thin typed wrapper over Chaptarr's /api/v1. Never throws: every call returns a ServiceResult. */
export function createChaptarrClient({ url, apiKey }: ChaptarrConnection, fetch: FetchFn) {
  const base = url.replace(/\/+$/, "");
  const call = <TSchema extends v.GenericSchema>(
    method: string,
    path: string,
    schema: TSchema,
    {
      query,
      body,
      timeoutMs,
    }: { query?: Record<string, string>; body?: unknown; timeoutMs?: number } = {},
  ) => {
    const target = new URL(`${base}/api/v1${path}`);
    if (query) target.search = new URLSearchParams(query).toString();
    return requestJson({
      fetch,
      service: "Chaptarr",
      url: target,
      schema,
      timeoutMs,
      init: {
        method,
        headers: {
          "X-Api-Key": apiKey,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    });
  };

  return {
    // Timeouts follow Stackarr's, which were tuned against real Chaptarr installs.
    status: () => call("GET", "/system/status", SystemStatusSchema, { timeoutMs: 15_000 }),
    /** Chaptarr's own warnings (e.g. its metadata service is down). */
    health: () => call("GET", "/health", v.array(HealthItemSchema), { timeoutMs: 15_000 }),
    // Chaptarr computes free space per root folder, which is slow on network shares.
    rootFolders: () => call("GET", "/rootfolder", v.array(RootFolderSchema), { timeoutMs: 60_000 }),
    qualityProfiles: () =>
      call("GET", "/qualityprofile", v.array(ProfileSchema), { timeoutMs: 30_000 }),
    metadataProfiles: () =>
      call("GET", "/metadataprofile", v.array(ProfileSchema), { timeoutMs: 30_000 }),
    /**
     * Books by provider ID (e.g. `az:<ASIN>`) in one media type: the local copies
     * if Chaptarr has them, else the metadata server's results.
     */
    lookup: (term: string, media: ChaptarrMedia) =>
      call("GET", "/book/lookup", v.array(BookSchema), {
        query: { term, mediaType: media },
        timeoutMs: 60_000,
      }),
    /** Deletes one local book row (one media side); files only when asked. */
    deleteBook: (id: number, { deleteFiles }: { deleteFiles: boolean }) =>
      call("DELETE", `/book/${id}`, v.unknown(), {
        query: { deleteFiles: String(deleteFiles), addImportListExclusion: "false" },
        timeoutMs: 60_000,
      }),
    pendingImports: () => call("GET", "/pendingauthorimport", v.array(PendingImportSchema)),
    queuePage: (page: number) =>
      call("GET", "/queue", QueuePageSchema, {
        query: { page: String(page), pageSize: "200", includeBook: "true" },
        timeoutMs: 30_000,
      }),
    /** `delete=true` removes the queued request (instead of keeping it as cancelled). */
    deletePendingImport: (id: number) =>
      call("DELETE", `/pendingauthorimport/${id}`, v.unknown(), { query: { delete: "true" } }),
    importBook: (body: BookImportRequest) =>
      call("POST", "/book/import", BookImportResponseSchema, { body, timeoutMs: 90_000 }),
  };
}

export type ChaptarrClient = ReturnType<typeof createChaptarrClient>;

export type SubmitBookInput = {
  /** Provider ID Chaptarr resolves: `az:<ASIN>` for audiobooks, `hc:<id>` for Hardcover books. */
  providerId: string;
  media: ChaptarrMedia;
  rootFolderPath: string;
  qualityProfileId: number;
  metadataProfileId: number;
};

export type SubmitBookOutcome =
  /** The book exists in Chaptarr, monitored, and its search was requested. */
  | { state: "added"; bookId: number; foreignBookId: string }
  /** Chaptarr queued the author until its metadata is ready; it will search then. */
  | { state: "pending"; pendingId?: number; foreignBookId: string };

/**
 * `PendingBookRequestException.UserMessage` in Chaptarr. `POST /book/import`
 * wraps that exception in a 400 ("Failed to import book: …") instead of the
 * documented 202, so it is recognized by its text.
 */
const PENDING_MESSAGE = "The author and requested book are being prepared by the metadata server.";

/**
 * Requests one book from Chaptarr in one media type, the way its API contract
 * intends: look the provider ID up for the author's, then `POST /book/import`, which
 * adds the author if needed, monitors only this book on this media side (never
 * the other format, never the rest of the bibliography) and searches for it.
 */
export async function submitBook(
  client: ChaptarrClient,
  input: SubmitBookInput,
): Promise<ServiceResult<SubmitBookOutcome>> {
  const lookup = await client.lookup(input.providerId, input.media);
  if (!lookup.ok) return lookup;
  const found = lookup.value.find((book) => book.author?.foreignAuthorId);
  const foreignAuthorId = found?.author?.foreignAuthorId;
  if (!found || !foreignAuthorId)
    return fail("not_found", `Chaptarr found no book for ${input.providerId}`);

  const foreignBookId = found.foreignBookId || input.providerId;
  const imported = await client.importBook({
    foreignBookId,
    foreignAuthorId,
    authorName: found.author?.authorName ?? undefined,
    mediaType: input.media,
    rootFolder: input.rootFolderPath,
    qualityProfileId: input.qualityProfileId,
    metadataProfileId: input.metadataProfileId,
    authorMonitoring: { monitor: "none", searchForMissing: true },
  });
  if (!imported.ok) {
    return imported.error.kind === "rejected" && imported.error.message.includes(PENDING_MESSAGE)
      ? ok({ state: "pending", foreignBookId })
      : imported;
  }
  const { id, pendingId } = imported.value;
  if (id !== undefined && id > 0) return ok({ state: "added", bookId: id, foreignBookId });
  if (pendingId !== undefined) return ok({ state: "pending", pendingId, foreignBookId });
  return fail("rejected", "Chaptarr accepted the book without returning its id");
}

/** Whether Chaptarr holds a file for this book in this media type (by provider ID, which is durable). */
export async function hasBookFile(
  client: ChaptarrClient,
  { term, media }: { term: string; media: ChaptarrMedia },
): Promise<ServiceResult<boolean>> {
  const books = await client.lookup(term, media);
  if (!books.ok) return books;
  return ok(books.value.some((book) => book.id > 0 && hasFile(book)));
}

const hasFile = (book: Book) => book.hasFiles === true || (book.statistics?.bookFileCount ?? 0) > 0;

export type RemoveOutcome = {
  /** Local book rows deleted (this media side only). */
  deletedBooks: number;
  /** Pending imports removed because they only held this book. */
  deletedPending: number;
  /** Pending imports that also hold other books: left in place. */
  sharedPending: number;
};

/**
 * Removes a requested book from Chaptarr, like Seerr's "Remove from Radarr":
 * its rows for that media side, and a pending import queued only for it.
 */
export async function removeBook(
  client: ChaptarrClient,
  {
    providerId,
    media,
    deleteFiles,
  }: { providerId: string; media: ChaptarrMedia; deleteFiles: boolean },
): Promise<ServiceResult<RemoveOutcome>> {
  const outcome: RemoveOutcome = { deletedBooks: 0, deletedPending: 0, sharedPending: 0 };

  const books = await client.lookup(providerId, media);
  if (!books.ok) return books;
  for (const book of books.value.filter((b) => b.id > 0 && b.mediaType === media)) {
    const deleted = await client.deleteBook(book.id, { deleteFiles });
    if (!deleted.ok) return deleted;
    outcome.deletedBooks++;
  }

  const pending = await client.pendingImports();
  if (!pending.ok) return pending;
  for (const item of pending.value) {
    const requested = new Set([
      ...(item.audiobookBooksToMonitor ?? []),
      ...(item.audiobookBooksToSearch ?? []),
      ...(item.ebookBooksToMonitor ?? []),
      ...(item.ebookBooksToSearch ?? []),
    ]);
    if (!requested.has(providerId)) continue;
    if (requested.size > 1) {
      outcome.sharedPending++;
      continue;
    }
    const deleted = await client.deletePendingImport(item.id);
    if (!deleted.ok) return deleted;
    outcome.deletedPending++;
  }

  if (outcome.deletedBooks + outcome.deletedPending + outcome.sharedPending === 0) {
    return fail("not_found", `Chaptarr has nothing for ${providerId}`);
  }
  return ok(outcome);
}

export type QueueItem = {
  bookId: number | null;
  foreignBookId: string | null;
  media: string | null;
  /** 0 to 1, from size and size left (null when unknown). */
  progress: number | null;
  state: string | null;
};

/** Everything in Chaptarr's download queue (a few pages at most). */
export async function downloadQueue(client: ChaptarrClient): Promise<ServiceResult<QueueItem[]>> {
  const items: QueueItem[] = [];
  for (let page = 1; page <= 5; page++) {
    const result = await client.queuePage(page);
    if (!result.ok) return result;
    for (const record of result.value.records) {
      const size = record.size ?? 0;
      items.push({
        bookId: record.bookId ?? null,
        foreignBookId: record.book?.foreignBookId ?? null,
        media: record.book?.mediaType ?? null,
        progress: size > 0 ? Math.min(1, Math.max(0, 1 - (record.sizeleft ?? size) / size)) : null,
        state: record.trackedDownloadState ?? record.status ?? null,
      });
    }
    if (result.value.records.length < 200) break;
  }
  return ok(items);
}
