import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { FetchFn, ServiceResult } from "#/server/services/result";
import { ok, requestJson } from "#/server/services/result";

/*
 * Audiobookshelf API, authenticated with an admin API key (Bearer). Checked
 * against its source (advplyr/audiobookshelf, server/controllers and the
 * models' toOldJSON*): libraries carry `folders: [{ id, fullPath }]`, items
 * carry `media.metadata` (with `asin` for books).
 */

const LibrarySchema = v.looseObject({
  id: v.string(),
  name: v.string(),
  /** "book" or "podcast" (only book libraries are used). */
  mediaType: v.string(),
  folders: v.optional(v.array(v.looseObject({ id: v.string(), fullPath: v.string() })), []),
});
export type AbsLibrary = v.InferOutput<typeof LibrarySchema>;
const LibrariesSchema = v.looseObject({ libraries: v.array(LibrarySchema) });

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

export type AbsItem = {
  itemId: string;
  libraryId: string;
  /** Uppercased ASIN. */
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
  const call = <TSchema extends v.GenericSchema>(
    method: string,
    path: string,
    schema: TSchema,
    {
      query,
      body,
      timeoutMs = 20_000,
    }: { query?: Record<string, string>; body?: unknown; timeoutMs?: number } = {},
  ) => {
    const target = new URL(`${base}${path}`);
    if (query) target.search = new URLSearchParams(query).toString();
    return requestJson({
      fetch,
      service: "Audiobookshelf",
      url: target,
      schema,
      timeoutMs,
      init: {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    });
  };

  const client = {
    /** Also the connection test: needs a valid key. */
    libraries: async (): Promise<ServiceResult<AbsLibrary[]>> => {
      const result = await call("GET", "/api/libraries", LibrariesSchema);
      return result.ok ? ok(result.value.libraries) : result;
    },

    /** Every item of a book library (paged until a short page: ABS may omit `total`). */
    async items(library: Pick<AbsLibrary, "id">): Promise<ServiceResult<AbsItem[]>> {
      const items: AbsItem[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await call(
          "GET",
          `/api/libraries/${encodeURIComponent(library.id)}/items`,
          ItemsPageSchema,
          {
            query: { limit: String(PAGE_SIZE), page: String(page) },
          },
        );
        if (!result.ok) return result;
        for (const item of result.value.results) {
          const metadata = item.media?.metadata;
          items.push({
            itemId: item.id,
            libraryId: library.id,
            asin: metadata?.asin?.trim().toUpperCase() || null,
            title: metadata?.title ?? "",
            author: metadata?.authorName ?? "",
          });
        }
        if (result.value.results.length < PAGE_SIZE) break;
      }
      return ok(items);
    },

    /** All audiobook items across book libraries, but the excluded ones. */
    async allItems(excluded: ReadonlySet<string> = new Set()): Promise<ServiceResult<AbsItem[]>> {
      const libraries = await client.libraries();
      if (!libraries.ok) return libraries;
      const items: AbsItem[] = [];
      const wanted = libraries.value.filter((l) => l.mediaType === "book" && !excluded.has(l.id));
      for (const library of wanted) {
        const result = await client.items(library);
        if (!result.ok) return result;
        items.push(...result.value);
      }
      return ok(items);
    },
  };
  return client;
}

export type AudiobookshelfClient = ReturnType<typeof createAudiobookshelfClient>;
