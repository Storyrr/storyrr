import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { FetchFn, ServiceResult } from "#/server/services/result";
import { ok, requestJson } from "#/server/services/result";

/*
 * Komga API, checked against its source (gotson/komga, commit 19cb01b:
 * interfaces/api/rest, infrastructure/security/SecurityConfiguration.kt):
 * an API key goes in the `X-API-Key` header (Account settings → API keys);
 * a user's own email and password work as HTTP Basic auth. JSON is camelCase.
 */

const LibrarySchema = v.looseObject({ id: v.string(), name: v.string() });
export type KomgaLibrary = v.InferOutput<typeof LibrarySchema>;

const SeriesSchema = v.looseObject({
  id: v.string(),
  libraryId: v.string(),
  name: v.string(),
  deleted: v.optional(v.boolean(), false),
  metadata: v.looseObject({
    title: v.string(),
    alternateTitles: v.optional(v.array(v.looseObject({ title: v.string() })), []),
  }),
  booksMetadata: v.optional(
    v.looseObject({
      authors: v.optional(v.array(v.looseObject({ name: v.string(), role: v.string() })), []),
    }),
  ),
});

// Spring's default Page JSON (content, last), checked against a running Komga 1.30.2 on 2026-11-25.
const SeriesPageSchema = v.looseObject({
  content: v.array(SeriesSchema),
  last: v.optional(v.boolean()),
});

const BookPageSchema = v.looseObject({
  content: v.array(
    v.looseObject({
      id: v.optional(v.string()),
      seriesId: v.string(),
      deleted: v.optional(v.boolean(), false),
      /** The book's file, as Komga mounts it. */
      url: v.optional(v.nullable(v.string())),
      metadata: v.looseObject({ title: v.string() }),
    }),
  ),
  last: v.optional(v.boolean()),
});

/** A book title worth matching: not a bare number ("1", "01"), as volumes often are. */
const hasLetter = (title: string) => /\p{L}/u.test(title);

const UserSchema = v.looseObject({ id: v.string(), email: v.string() });
export type KomgaUser = v.InferOutput<typeof UserSchema>;

export type KomgaSeries = {
  seriesId: string;
  libraryId: string;
  names: string[];
  author: string;
  /** Its books' files. */
  paths: string[];
  /** Its books, each with its own page. */
  books: { bookId: string; title: string; path: string | null }[];
};

export type KomgaConnection = { url: string; apiKey: string };

const PAGE_SIZE = 500;
/** Safety cap: 100,000 series. */
const MAX_PAGES = 200;

export function createKomgaClient({ url, apiKey }: KomgaConnection, fetch: FetchFn) {
  const base = url.replace(/\/+$/, "");

  function call<TSchema extends v.GenericSchema>(
    method: string,
    path: string,
    schema: TSchema,
    { query, body }: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<ServiceResult<v.InferOutput<TSchema>>> {
    const target = new URL(`${base}${path}`);
    if (query) target.search = new URLSearchParams(query).toString();
    return requestJson({
      fetch,
      service: "Komga",
      url: target,
      schema,
      timeoutMs: 30_000,
      init: {
        method,
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    });
  }

  return {
    /** Checks a user's own credentials (sign in with Komga); no API key involved. */
    login: (email: string, password: string): Promise<ServiceResult<KomgaUser>> =>
      requestJson({
        fetch,
        service: "Komga",
        url: new URL(`${base}/api/v2/users/me`),
        schema: UserSchema,
        timeoutMs: 15_000,
        init: {
          headers: {
            Authorization: `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`,
            Accept: "application/json",
          },
        },
      }),

    /** The server's accounts (import users); the API key's user must be an admin. */
    users: () => call("GET", "/api/v2/users", v.array(UserSchema)),

    /** Also the connection test. */
    libraries: () => call("GET", "/api/v1/libraries", v.array(LibrarySchema)),

    /** Every series the key's user can see, across libraries (deleted ones left out), with its books' titles. */
    async allSeries(): Promise<ServiceResult<KomgaSeries[]>> {
      const series: KomgaSeries[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await call("POST", "/api/v1/series/list", SeriesPageSchema, {
          query: { page: String(page), size: String(PAGE_SIZE) },
          body: {},
        });
        if (!result.ok) return result;
        for (const item of result.value.content) {
          if (item.deleted) continue;
          const names = [
            item.metadata.title,
            item.name,
            ...item.metadata.alternateTitles.map((alternate) => alternate.title),
          ].filter(Boolean);
          const writers = (item.booksMetadata?.authors ?? []).filter((a) => a.role === "writer");
          series.push({
            seriesId: item.id,
            libraryId: item.libraryId,
            names,
            author: writers.map((a) => a.name).join(", "),
            paths: [],
            books: [],
          });
        }
        if (result.value.last ?? result.value.content.length < PAGE_SIZE) break;
      }
      // A series may hold several books (a folder of a real series, or a list
      // from the EPUBs' metadata): each book's own title is indexed too.
      const byId = new Map(series.map((item) => [item.seriesId, item]));
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await call("POST", "/api/v1/books/list", BookPageSchema, {
          query: { page: String(page), size: String(PAGE_SIZE) },
          body: {},
        });
        if (!result.ok) return result;
        for (const book of result.value.content) {
          const item = byId.get(book.seriesId);
          if (!item || book.deleted) continue;
          if (hasLetter(book.metadata.title)) item.names.push(book.metadata.title);
          if (book.url) item.paths.push(book.url);
          if (book.id)
            item.books.push({
              bookId: book.id,
              title: book.metadata.title,
              path: book.url ?? null,
            });
        }
        if (result.value.last ?? result.value.content.length < PAGE_SIZE) break;
      }
      return ok(series.map((item) => ({ ...item, names: [...new Set(item.names)] })));
    },
  };
}

export type KomgaClient = ReturnType<typeof createKomgaClient>;
