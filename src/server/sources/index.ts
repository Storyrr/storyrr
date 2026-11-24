import "@tanstack/react-start/server-only";

import type { MediaDetails, MediaSummary } from "#/lib/media";
import type { SearchableType } from "#/lib/media-types";
import type { AppDatabase } from "#/server/db/client";
import { ownedAsins, ownedFeeds, ownedTitles } from "#/server/library";
import { feedKey, titleKey } from "#/lib/match";
import type { Services } from "#/server/services/factory";
import { fail, type ServiceResult } from "#/server/services/result";

/**
 * One module per media type: where to search, how to tell what's owned, and
 * which provider ID Chaptarr resolves. The request flow only talks to this.
 */
export type MediaSource = {
  type: SearchableType;
  /** Metadata provider, as stored in `media.source`. */
  source: string;
  search(services: Services, query: string): Promise<ServiceResult<MediaSummary[]>>;
  getDetails(services: Services, id: string): Promise<ServiceResult<MediaDetails>>;
  /** External ids of the items a library already holds. */
  owned(
    db: AppDatabase,
    items: readonly Pick<MediaSummary, "externalId" | "title" | "feedUrl">[],
  ): Set<string>;
};

const audiobooks: MediaSource = {
  type: "audiobook",
  source: "audible",
  async search(services, query) {
    return (await services.audible()).search(query);
  },
  async getDetails(services, id) {
    return (await services.audible()).getByAsin(id);
  },
  // By ASIN in Audiobookshelf: titles in libraries are often wrong.
  owned(db, items) {
    const owned = ownedAsins(
      db,
      items.map((item) => item.externalId),
    );
    return new Set(
      items.filter((item) => owned.has(item.externalId.toUpperCase())).map((i) => i.externalId),
    );
  },
};

const ebooks: MediaSource = {
  type: "ebook",
  source: "hardcover",
  async search(services, query) {
    const hardcover = await services.hardcover();
    return hardcover ? hardcover.search(query) : fail("not_configured", "Hardcover token missing");
  },
  async getDetails(services, id) {
    const hardcover = await services.hardcover();
    return hardcover ? hardcover.getById(id) : fail("not_configured", "Hardcover token missing");
  },
  // By normalized title in Kavita (no shared ID): "probably owned".
  owned(db, items) {
    const owned = ownedTitles(
      db,
      items.map((item) => item.title),
    );
    return new Set(
      items.filter((item) => owned.has(titleKey(item.title))).map((i) => i.externalId),
    );
  },
};

const podcasts: MediaSource = {
  type: "podcast",
  source: "itunes",
  async search(services, query) {
    return (await services.itunes()).search(query);
  },
  async getDetails(services, id) {
    return (await services.itunes()).getById(id);
  },
  // By feed URL in Audiobookshelf's podcast libraries.
  owned(db, items) {
    const withFeed = items.flatMap((item) =>
      item.feedUrl ? [{ ...item, feedUrl: item.feedUrl }] : [],
    );
    const owned = ownedFeeds(
      db,
      withFeed.map((item) => item.feedUrl),
    );
    return new Set(
      withFeed.filter((item) => owned.has(feedKey(item.feedUrl))).map((i) => i.externalId),
    );
  },
};

export const mediaSources: Record<SearchableType, MediaSource> = {
  audiobook: audiobooks,
  ebook: ebooks,
  podcast: podcasts,
};

/** The provider ID Chaptarr resolves for a stored media row, or null if it can't. */
export function chaptarrProviderId(source: string, externalId: string): string | null {
  if (source === "audible") return `az:${externalId}`;
  if (source === "hardcover") return `hc:${externalId}`;
  return null;
}
