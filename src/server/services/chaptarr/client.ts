import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { FetchFn, ServiceResult } from "#/server/services/result";
import { fail, ok, requestJson } from "#/server/services/result";

import {
  AuthorSchema,
  BookLookupSchema,
  BookSchema,
  ProfileSchema,
  RootFolderSchema,
  SystemStatusSchema,
  type Author,
  type Book,
} from "./schemas";

export type ChaptarrConnection = { url: string; apiKey: string };
export type ChaptarrMedia = "audiobook" | "ebook";

/** Chaptarr's per-media "monitor existing books": 0 none, 1 all, 2 selected (Stackarr). */
const MONITOR_EXISTING_NONE = 0;
const MONITOR_EXISTING_SELECTED = 2;

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
    status: () => call("GET", "/system/status", SystemStatusSchema),
    rootFolders: () => call("GET", "/rootfolder", v.array(RootFolderSchema)),
    qualityProfiles: () => call("GET", "/qualityprofile", v.array(ProfileSchema)),
    metadataProfiles: () => call("GET", "/metadataprofile", v.array(ProfileSchema)),
    authors: () => call("GET", "/author", v.array(AuthorSchema)),
    booksByAuthor: (authorId: number) =>
      call("GET", "/book", v.array(BookSchema), { query: { authorId: String(authorId) } }),
    lookupByAsin: (asin: string, media: ChaptarrMedia) =>
      call("GET", "/book/lookup", v.array(BookLookupSchema), {
        query: { term: `az:${asin}`, mediaType: media },
        timeoutMs: 60_000,
      }),
    /** Author writes always carry the media scope (AGENTS.md › Chaptarr). */
    addAuthor: (author: Author, media: ChaptarrMedia) =>
      call("POST", "/author", AuthorSchema, {
        query: { mediaType: media },
        body: author,
        timeoutMs: 90_000,
      }),
    updateAuthor: (author: Author & { id: number }, media: ChaptarrMedia) =>
      call("PUT", `/author/${author.id}`, AuthorSchema, {
        query: { mediaType: media },
        body: author,
      }),
    monitorBooks: (bookIds: number[]) =>
      call("PUT", "/book/monitor", v.unknown(), { body: { bookIds, monitored: true } }),
    searchBooks: (bookIds: number[]) =>
      call("POST", "/command", v.unknown(), { body: { name: "BookSearch", bookIds } }),
  };
}

export type ChaptarrClient = ReturnType<typeof createChaptarrClient>;

export type SubmitBookInput = {
  asin: string;
  title: string;
  media: ChaptarrMedia;
  rootFolderPath: string;
  qualityProfileId: number;
  metadataProfileId: number;
};

export type SubmitBookOutcome = { authorId: number; bookId: number; authorName: string };

export type SubmitOptions = {
  /** Books appear after Chaptarr's async author refresh: how many times to look, and how long to wait. */
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Hands one book to Chaptarr: resolve it by ASIN, make sure its author exists
 * and is monitored for this media (selected books only, never the whole
 * bibliography), then monitor and search just that book.
 */
export async function submitBook(
  client: ChaptarrClient,
  input: SubmitBookInput,
  { attempts = 8, delayMs = 2000, sleep = defaultSleep }: SubmitOptions = {},
): Promise<ServiceResult<SubmitBookOutcome>> {
  const lookup = await client.lookupByAsin(input.asin, input.media);
  if (!lookup.ok) return lookup;
  const found = lookup.value.find((book) => book.author?.foreignAuthorId);
  if (!found?.author) return fail("not_found", `Chaptarr found no book for ASIN ${input.asin}`);

  const existingAuthors = await client.authors();
  if (!existingAuthors.ok) return existingAuthors;
  let author = existingAuthors.value.find(
    (a) => a.foreignAuthorId === found.author?.foreignAuthorId,
  );

  if (!author) {
    const added = await client.addAuthor(newAuthorPayload(found.author, input), input.media);
    if (!added.ok) return added;
    author = added.value;
  } else {
    const updated = await ensureMonitoredFor(client, author, input);
    if (!updated.ok) return updated;
  }
  const authorId = author.id;
  if (authorId === undefined) return fail("rejected", "Chaptarr returned an author without an id");

  let book: Book | undefined;
  for (let attempt = 0; attempt < attempts && !book; attempt++) {
    if (attempt > 0) await sleep(delayMs);
    const books = await client.booksByAuthor(authorId);
    if (!books.ok) return books;
    book = matchBook(books.value, input, found.foreignBookId ?? undefined);
  }
  if (!book) {
    return fail("not_found", `Chaptarr added the author but doesn't list "${input.title}" yet`);
  }

  const monitored = await client.monitorBooks([book.id]);
  if (!monitored.ok) return monitored;
  const searched = await client.searchBooks([book.id]);
  if (!searched.ok) return searched;
  return ok({ authorId, bookId: book.id, authorName: author.authorName ?? "" });
}

function newAuthorPayload(author: Author, input: SubmitBookInput): Author {
  const audiobook = input.media === "audiobook";
  const prefix = input.media;
  // UNVERIFIED: per-media field names follow Stackarr; the legacy fields are mapped by Chaptarr
  // onto the `mediaType` write scope.
  return {
    ...author,
    monitored: true,
    monitorNewItems: "none",
    rootFolderPath: input.rootFolderPath,
    qualityProfileId: input.qualityProfileId,
    metadataProfileId: input.metadataProfileId,
    [`${prefix}RootFolderPath`]: input.rootFolderPath,
    [`${prefix}QualityProfileId`]: input.qualityProfileId,
    [`${prefix}MetadataProfileId`]: input.metadataProfileId,
    audiobookMonitorExisting: audiobook ? MONITOR_EXISTING_SELECTED : MONITOR_EXISTING_NONE,
    ebookMonitorExisting: audiobook ? MONITOR_EXISTING_NONE : MONITOR_EXISTING_SELECTED,
    audiobookMonitored: audiobook,
    ebookMonitored: !audiobook,
    audiobookMonitorNewItems: "none",
    ebookMonitorNewItems: "none",
    addOptions: { monitor: "none", booksToMonitor: [], searchForMissingBooks: false },
  };
}

/** An author first added for the other format lacks this media's folder and profiles. */
async function ensureMonitoredFor(
  client: ChaptarrClient,
  author: Author,
  input: SubmitBookInput,
): Promise<ServiceResult<unknown>> {
  if (author.id === undefined) return ok(undefined);
  const prefix = input.media;
  const next: Author & { id: number } = { ...author, id: author.id, monitored: true };
  if (!author[`${prefix}MonitorExisting`]) {
    next[`${prefix}MonitorExisting`] = MONITOR_EXISTING_SELECTED;
    next[`${prefix}MonitorNewItems`] = "none";
    next[`${prefix}Monitored`] = true;
  }
  next[`${prefix}QualityProfileId`] ??= input.qualityProfileId;
  next[`${prefix}MetadataProfileId`] ??= input.metadataProfileId;
  next[`${prefix}RootFolderPath`] = input.rootFolderPath;
  const changed = Object.keys(next).some((key) => next[key] !== author[key]);
  return changed ? client.updateAuthor(next, input.media) : ok(undefined);
}

const normalize = (text: string | null | undefined) =>
  (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The author's row for this book and media: ASIN first, then foreign id, then exact title. */
export function matchBook(
  books: Book[],
  { asin, title, media }: Pick<SubmitBookInput, "asin" | "title" | "media">,
  foreignBookId?: string,
): Book | undefined {
  const split = books.some((b) => b.mediaType);
  const rows = split ? books.filter((b) => b.mediaType === media) : books;
  const wanted = asin.toUpperCase();
  return (
    rows.find((b) => [b.asin, b.audibleASIN].some((a) => a?.toUpperCase() === wanted)) ??
    (foreignBookId ? rows.find((b) => b.foreignBookId === foreignBookId) : undefined) ??
    rows.find((b) => normalize(b.title) === normalize(title))
  );
}

/** Whether Chaptarr has imported a file for this book (availability check). */
export async function hasBookFile(
  client: ChaptarrClient,
  { authorId, bookId }: { authorId: number; bookId: number },
): Promise<ServiceResult<boolean>> {
  const books = await client.booksByAuthor(authorId);
  if (!books.ok) return books;
  const book = books.value.find((b) => b.id === bookId);
  return ok((book?.statistics?.bookFileCount ?? 0) > 0);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
