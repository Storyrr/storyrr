import "@tanstack/react-start/server-only";

import type { MediaDetails, MediaSummary } from "#/lib/media";
import type { SearchableType } from "#/lib/media-types";
import type { AppDatabase } from "#/server/db/client";
import { ownedAsins, ownedTitles } from "#/server/library";
import { manuallyOwned } from "#/server/requests/manage";
import { titleKey } from "#/lib/match";
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
  /** What's popular right now, for Discover. */
  trending(services: Services): Promise<ServiceResult<MediaSummary[]>>;
  /** External ids of the items a library already holds. */
  owned(db: AppDatabase, items: readonly Pick<MediaSummary, "externalId" | "title">[]): Set<string>;
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
  async trending(services) {
    return (await services.audible()).bestsellers();
  },
  // By ASIN in Audiobookshelf: titles in libraries are often wrong.
  owned(db, items) {
    const ids = items.map((item) => item.externalId);
    const owned = ownedAsins(db, ids);
    const manual = manuallyOwned(db, "audible", ids);
    return new Set(
      items
        .filter((item) => owned.has(item.externalId.toUpperCase()) || manual.has(item.externalId))
        .map((i) => i.externalId),
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
  async trending(services) {
    const hardcover = await services.hardcover();
    return hardcover ? hardcover.trending() : fail("not_configured", "Hardcover token missing");
  },
  // By normalized title in Kavita (no shared ID): "probably owned".
  owned(db, items) {
    const owned = ownedTitles(
      db,
      items.map((item) => item.title),
    );
    const manual = manuallyOwned(
      db,
      "hardcover",
      items.map((item) => item.externalId),
    );
    return new Set(
      items
        .filter((item) => owned.has(titleKey(item.title)) || manual.has(item.externalId))
        .map((i) => i.externalId),
    );
  },
};

export const mediaSources: Record<SearchableType, MediaSource> = {
  audiobook: audiobooks,
  ebook: ebooks,
};

/** The provider ID Chaptarr resolves for a stored media row, or null if it can't. */
export function chaptarrProviderId(source: string, externalId: string): string | null {
  if (source === "audible") return `az:${externalId}`;
  if (source === "hardcover") return `hc:${externalId}`;
  return null;
}
