import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { FetchFn, ServiceResult } from "#/server/services/result";
import { ok, requestJson } from "#/server/services/result";

/*
 * Audiobookshelf API, authenticated with an admin API key (Bearer). Shapes
 * follow the ABS API docs and Stackarr's absclient.py, which reads the same
 * fields in production; not yet checked against a live instance here.
 */

// UNVERIFIED: GET /api/libraries → { libraries: [{ id, name, mediaType: "book" | "podcast", folders }] }.
const LibrarySchema = v.looseObject({
  id: v.string(),
  name: v.string(),
  mediaType: v.string(),
  folders: v.optional(v.array(v.looseObject({ id: v.string(), fullPath: v.string() })), []),
});
export type AbsLibrary = v.InferOutput<typeof LibrarySchema>;
const LibrariesSchema = v.looseObject({ libraries: v.array(LibrarySchema) });

// UNVERIFIED: GET /api/libraries/:id/items?limit&page → { results: [{ id, media: { metadata } }] }.
const ItemSchema = v.looseObject({
  id: v.string(),
  media: v.optional(
    v.looseObject({
      metadata: v.optional(
        v.looseObject({
          title: v.optional(v.nullable(v.string())),
          authorName: v.optional(v.nullable(v.string())),
          asin: v.optional(v.nullable(v.string())),
        }),
      ),
    }),
  ),
});
const ItemsPageSchema = v.looseObject({ results: v.array(ItemSchema) });

export type AbsBookItem = {
  itemId: string;
  libraryId: string;
  asin: string | null;
  title: string;
  author: string;
};

export type AbsConnection = { url: string; apiKey: string };

const PAGE_SIZE = 200;
/** Safety cap: 40,000 items per library. */
const MAX_PAGES = 200;

export function createAudiobookshelfClient({ url, apiKey }: AbsConnection, fetch: FetchFn) {
  const base = url.replace(/\/+$/, "");
  const get = <TSchema extends v.GenericSchema>(
    path: string,
    schema: TSchema,
    query?: Record<string, string>,
  ) => {
    const target = new URL(`${base}${path}`);
    if (query) target.search = new URLSearchParams(query).toString();
    return requestJson({
      fetch,
      service: "Audiobookshelf",
      url: target,
      schema,
      init: { headers: { Authorization: `Bearer ${apiKey}` } },
      timeoutMs: 20_000,
    });
  };

  const client = {
    /** Also the connection test: needs a valid key. */
    libraries: async (): Promise<ServiceResult<AbsLibrary[]>> => {
      const result = await get("/api/libraries", LibrariesSchema);
      return result.ok ? ok(result.value.libraries) : result;
    },

    /** Every item of a book library (paged until a short page: ABS may omit `total`). */
    async bookItems(libraryId: string): Promise<ServiceResult<AbsBookItem[]>> {
      const items: AbsBookItem[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await get(
          `/api/libraries/${encodeURIComponent(libraryId)}/items`,
          ItemsPageSchema,
          {
            limit: String(PAGE_SIZE),
            page: String(page),
          },
        );
        if (!result.ok) return result;
        for (const item of result.value.results) {
          const metadata = item.media?.metadata;
          items.push({
            itemId: item.id,
            libraryId,
            asin: metadata?.asin?.trim().toUpperCase() || null,
            title: metadata?.title ?? "",
            author: metadata?.authorName ?? "",
          });
        }
        if (result.value.results.length < PAGE_SIZE) break;
      }
      return ok(items);
    },

    /** All audiobook items across book libraries. */
    async allBookItems(): Promise<ServiceResult<AbsBookItem[]>> {
      const libraries = await client.libraries();
      if (!libraries.ok) return libraries;
      const items: AbsBookItem[] = [];
      for (const library of libraries.value.filter((l) => l.mediaType === "book")) {
        const result = await client.bookItems(library.id);
        if (!result.ok) return result;
        items.push(...result.value);
      }
      return ok(items);
    },
  };
  return client;
}

export type AudiobookshelfClient = ReturnType<typeof createAudiobookshelfClient>;
