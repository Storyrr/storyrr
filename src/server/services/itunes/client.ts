import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { MediaDetails, MediaSummary } from "#/lib/media";
import { fail, ok, requestJson, type FetchFn, type ServiceResult } from "#/server/services/result";

/*
 * iTunes Search API (public, no key): podcast directory. Shapes verified
 * against itunes.apple.com on 2026-11-24; fixtures are trimmed recordings.
 */
const ResultSchema = v.looseObject({
  kind: v.optional(v.string()),
  collectionId: v.number(),
  collectionName: v.optional(v.nullable(v.string())),
  artistName: v.optional(v.nullable(v.string())),
  artistId: v.optional(v.nullable(v.number())),
  collectionViewUrl: v.optional(v.nullable(v.string())),
  feedUrl: v.optional(v.nullable(v.string())),
  artworkUrl600: v.optional(v.nullable(v.string())),
  artworkUrl100: v.optional(v.nullable(v.string())),
  releaseDate: v.optional(v.nullable(v.string())),
  collectionExplicitness: v.optional(v.nullable(v.string())),
  trackCount: v.optional(v.nullable(v.number())),
  genres: v.optional(v.nullable(v.array(v.string()))),
});
type Result = v.InferOutput<typeof ResultSchema>;
const ResponseSchema = v.looseObject({ resultCount: v.number(), results: v.array(ResultSchema) });

/** Store country (two letters, e.g. "fr"): results and their language follow the store. */
export function createItunesClient({ fetch, country }: { fetch: FetchFn; country: string }) {
  const call = (path: string, params: Record<string, string>) => {
    const url = new URL(`https://itunes.apple.com/${path}`);
    url.search = new URLSearchParams({ ...params, country }).toString();
    return requestJson({
      fetch,
      service: "iTunes",
      url,
      schema: ResponseSchema,
      timeoutMs: 15_000,
    });
  };

  return {
    async search(term: string, { limit = 25 } = {}): Promise<ServiceResult<MediaSummary[]>> {
      const result = await call("search", {
        media: "podcast",
        entity: "podcast",
        term,
        limit: String(limit),
      });
      if (!result.ok) return result;
      return ok(result.value.results.flatMap((item) => toItem(item) ?? []));
    },

    async getById(id: string): Promise<ServiceResult<MediaDetails>> {
      const result = await call("lookup", { id, entity: "podcast" });
      if (!result.ok) return result;
      const item = result.value.results.map(toItem).find((found) => found !== null);
      return item ? ok(item) : fail("not_found", `No podcast ${id} on iTunes`);
    },
  };
}

export type ItunesClient = ReturnType<typeof createItunesClient>;

/** Podcasts without a feed can't be subscribed to: they're left out. */
function toItem(result: Result): (MediaSummary & MediaDetails) | null {
  if (!result.collectionName || !result.feedUrl) return null;
  return {
    type: "podcast",
    source: "itunes",
    externalId: String(result.collectionId),
    title: result.collectionName,
    authors: result.artistName ? [result.artistName] : [],
    narrators: [],
    series: [],
    // Date of the latest episode.
    releaseDate: result.releaseDate?.slice(0, 10),
    coverUrl: result.artworkUrl600 ?? result.artworkUrl100 ?? undefined,
    feedUrl: result.feedUrl,
    episodeCount: result.trackCount ?? undefined,
    genres: (result.genres ?? []).filter((genre) => genre !== "Podcasts"),
  };
}
