import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { FetchFn, ServiceResult } from "#/server/services/result";
import { fail, ok, requestJson } from "#/server/services/result";

/*
 * Audiobookshelf API, authenticated with an admin API key (Bearer). Checked
 * against its source (advplyr/audiobookshelf, server/controllers and the
 * models' toOldJSON*): libraries carry `folders: [{ id, fullPath }]`, items
 * carry `media.metadata` (`asin` for books, `feedUrl` for podcasts).
 */

const LibrarySchema = v.looseObject({
  id: v.string(),
  name: v.string(),
  /** "book" or "podcast". */
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
          author: v.optional(v.nullable(v.string())),
          asin: v.optional(v.nullable(v.string())),
          feedUrl: v.optional(v.nullable(v.string())),
        }),
      ),
    }),
  ),
});
const ItemsPageSchema = v.looseObject({ results: v.array(ItemSchema) });

export type AbsItem = {
  kind: "book" | "podcast";
  itemId: string;
  libraryId: string;
  /** Books: uppercased ASIN. */
  asin: string | null;
  /** Podcasts: the RSS feed it's subscribed to. */
  feedUrl: string | null;
  title: string;
  author: string;
};

/** Body of `POST /api/podcasts` (as ABS's own "new podcast" modal sends it). */
export type CreatePodcastInput = {
  libraryId: string;
  folderId: string;
  /** Must be inside the folder: `<folder fullPath>/<sanitized title>`. */
  path: string;
  metadata: {
    title: string;
    author?: string;
    description?: string;
    releaseDate?: string;
    genres?: string[];
    feedUrl: string;
    imageUrl?: string;
    itunesPageUrl?: string;
    itunesId?: string;
    language?: string;
    explicit?: boolean;
  };
  autoDownloadEpisodes: boolean;
};

const CreatedItemSchema = v.looseObject({ id: v.string() });
const FeedSchema = v.looseObject({
  podcast: v.looseObject({
    metadata: v.optional(
      v.looseObject({
        description: v.optional(v.nullable(v.string())),
        descriptionPlain: v.optional(v.nullable(v.string())),
        language: v.optional(v.nullable(v.string())),
        explicit: v.optional(v.nullable(v.union([v.boolean(), v.string()]))),
      }),
    ),
  }),
});

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

    /** Every item of a library (paged until a short page: ABS may omit `total`). */
    async items(library: Pick<AbsLibrary, "id" | "mediaType">): Promise<ServiceResult<AbsItem[]>> {
      const kind = library.mediaType === "podcast" ? "podcast" : "book";
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
            kind,
            itemId: item.id,
            libraryId: library.id,
            asin: kind === "book" ? metadata?.asin?.trim().toUpperCase() || null : null,
            feedUrl: kind === "podcast" ? metadata?.feedUrl?.trim() || null : null,
            title: metadata?.title ?? "",
            author: metadata?.authorName ?? metadata?.author ?? "",
          });
        }
        if (result.value.results.length < PAGE_SIZE) break;
      }
      return ok(items);
    },

    /** All items of the book and podcast libraries. */
    async allItems(): Promise<ServiceResult<AbsItem[]>> {
      const libraries = await client.libraries();
      if (!libraries.ok) return libraries;
      const items: AbsItem[] = [];
      for (const library of libraries.value.filter(
        (l) => l.mediaType === "book" || l.mediaType === "podcast",
      )) {
        const result = await client.items(library);
        if (!result.ok) return result;
        items.push(...result.value);
      }
      return ok(items);
    },

    /** ABS fetches and parses the RSS feed (description, language…). Admin key required. */
    feed: (feedUrl: string) =>
      call("POST", "/api/podcasts/feed", FeedSchema, {
        body: { rssFeed: feedUrl },
        timeoutMs: 30_000,
      }),

    /** Creates the podcast in a library folder; ABS downloads the cover and new episodes itself. */
    async createPodcast(input: CreatePodcastInput): Promise<ServiceResult<{ itemId: string }>> {
      const result = await call("POST", "/api/podcasts", CreatedItemSchema, {
        body: {
          libraryId: input.libraryId,
          folderId: input.folderId,
          path: input.path,
          media: { metadata: input.metadata, autoDownloadEpisodes: input.autoDownloadEpisodes },
        },
        timeoutMs: 60_000,
      });
      if (!result.ok) {
        // ABS answers 400 "Podcast already exists" when the folder is taken.
        return result.error.kind === "rejected" && /already exists/i.test(result.error.message)
          ? fail("rejected", "Podcast already exists")
          : result;
      }
      return ok({ itemId: result.value.id });
    },
  };
  return client;
}

export type AudiobookshelfClient = ReturnType<typeof createAudiobookshelfClient>;

/**
 * A folder name the way ABS's own client builds it (`$sanitizeFilename`):
 * first colon → " - ", characters illegal on common file systems removed,
 * whitespace collapsed, at most 255 bytes.
 */
export function sanitizeFilename(name: string): string {
  let sanitized = name
    .replace(":", " - ")
    .replace(/[/?<>\\:*|"]/g, "")
    // oxlint-disable-next-line no-control-regex -- control characters are exactly what must go
    .replace(/[\x00-\x1f\x80-\x9f]/g, "")
    .replace(/^\.+$/, "")
    .replace(/[\n\r]/g, "")
    .replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, "")
    .replace(/[. ]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  while (Buffer.byteLength(sanitized, "utf16le") > 255) sanitized = sanitized.slice(0, -1);
  return sanitized;
}
