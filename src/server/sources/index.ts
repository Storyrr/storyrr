import "@tanstack/react-start/server-only";

import type {
  MediaCollection,
  MediaDetails,
  MediaSummary,
  MediaTagPage,
  SeriesSummary,
} from "#/lib/media";
import type { SearchableType } from "#/lib/media-types";
import type { AppDatabase } from "#/server/db/client";
import { ownedAsins, ownedHardcoverIds, ownedTitles } from "#/server/library";
import { manuallyOwned } from "#/server/requests/manage";
import { titleKey } from "#/lib/match";
import type { Services } from "#/server/services/factory";
import { fail, ok, type ServiceResult } from "#/server/services/result";

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
  /** What's popular right now, for Discover (page 1) and Browse (more pages where the provider has them). */
  trending(services: Services, page?: number): Promise<ServiceResult<MediaSummary[]>>;
  /** A series' works in reading order. */
  series(services: Services, id: string): Promise<ServiceResult<MediaCollection>>;
  /** Series matching a search (empty where the provider can't search series). */
  searchSeries(services: Services, query: string): Promise<ServiceResult<SeriesSummary[]>>;
  /** Other versions of a series, e.g. a translation numbered apart (empty where unsupported). */
  relatedSeries(
    services: Services,
    id: string,
    name: string,
  ): Promise<ServiceResult<SeriesSummary[]>>;
  /** An author's works (`name`: Audible searches by name). */
  author(services: Services, id: string, name: string): Promise<ServiceResult<MediaCollection>>;
  /** A genre's or keyword's titles, most popular first (`id`: MediaTag.id). */
  tag(services: Services, id: string, page: number): Promise<ServiceResult<MediaTagPage>>;
  /**
   * External ids of the items a library already holds. `exact` leaves out
   * matches by title alone ("probably owned"): another book can share a title.
   */
  owned(
    db: AppDatabase,
    items: readonly (Pick<MediaSummary, "externalId" | "title" | "altTitles"> & {
      series?: readonly { name: string }[] | null;
    })[],
    options?: { exact?: boolean },
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
  async trending(services, page = 1) {
    return (await services.audible()).bestsellers({ page, limit: page === 1 ? 20 : 40 });
  },
  async series(services, id) {
    return (await services.audible()).series(id);
  },
  // Audible has no series search, and an audiobook's translation is its own series ASIN.
  searchSeries: async () => ok([]),
  relatedSeries: async () => ok([]),
  async author(services, id, name) {
    return (await services.audible()).author(id, name);
  },
  async tag(services, id, page) {
    return (await services.audible()).category(id, page);
  },
  // By ASIN in Audiobookshelf (titles there are often wrong); by title in Jellyfin (no ASIN).
  owned(db, items, { exact = false } = {}) {
    const ids = items.map((item) => item.externalId);
    const owned = ownedAsins(db, ids);
    const titles = exact
      ? new Set<string>()
      : ownedTitles(
          db,
          "audiobook",
          items.map((item) => item.title),
        );
    const manual = manuallyOwned(db, "audible", ids);
    return new Set(
      items
        .filter(
          (item) =>
            owned.has(item.externalId.toUpperCase()) ||
            titles.has(titleKey(item.title)) ||
            manual.has(item.externalId),
        )
        .map((i) => i.externalId),
    );
  },
};

type Titled = Pick<MediaSummary, "title" | "altTitles"> & {
  series?: readonly { name: string }[] | null;
};

/**
 * The titles an eBook may have in a library: its own and its other editions'.
 * Some editions are titled like the series ("Harry Potter"), which a library also
 * lists as a series: that title would mark every volume as owned. Same for a title
 * the book's own starts with ("Solo Leveling" for "Solo Leveling: The Novel Omnibus").
 */
export function ebookTitles(item: Titled): string[] {
  const own = titleKey(item.title);
  const series = new Set(
    item.series?.flatMap(({ name }) => [titleKey(name), titleKey(name.replace(/\(.*?\)/g, ""))]),
  );
  const alternatives = (item.altTitles ?? []).filter((alt) => {
    const key = titleKey(alt);
    return !series.has(key) && !own.startsWith(`${key} `);
  });
  return [item.title, ...alternatives];
}

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
  async trending(services, page = 1) {
    const hardcover = await services.hardcover();
    if (!hardcover) return fail("not_configured", "Hardcover token missing");
    // Hardcover's trending list has one page: Browse shows a longer one, then nothing more.
    return page === 1 ? hardcover.trending({ limit: 40 }) : ok([]);
  },
  async series(services, id) {
    const hardcover = await services.hardcover();
    return hardcover ? hardcover.series(id) : fail("not_configured", "Hardcover token missing");
  },
  async searchSeries(services, query) {
    const hardcover = await services.hardcover();
    return hardcover
      ? hardcover.searchSeries(query)
      : fail("not_configured", "Hardcover token missing");
  },
  async relatedSeries(services, id, name) {
    const hardcover = await services.hardcover();
    return hardcover
      ? hardcover.relatedSeries(id, name)
      : fail("not_configured", "Hardcover token missing");
  },
  async author(services, id) {
    const hardcover = await services.hardcover();
    return hardcover ? hardcover.author(id) : fail("not_configured", "Hardcover token missing");
  },
  async tag(services, id, page) {
    const hardcover = await services.hardcover();
    return hardcover ? hardcover.tag(id, page) : fail("not_configured", "Hardcover token missing");
  },
  // By Hardcover id in Chaptarr (exact). Else by normalized title in Kavita, Komga and
  // Jellyfin (no shared ID): "probably owned", under any of the work's titles, since a
  // library often holds a translation.
  owned(db, items, { exact = false } = {}) {
    const owned = exact ? new Set<string>() : ownedTitles(db, "ebook", items.flatMap(ebookTitles));
    const ids = items.map((item) => item.externalId);
    const held = ownedHardcoverIds(db, ids);
    const manual = manuallyOwned(db, "hardcover", ids);
    return new Set(
      items
        .filter(
          (item) =>
            held.has(item.externalId) ||
            ebookTitles(item).some((title) => owned.has(titleKey(title))) ||
            manual.has(item.externalId),
        )
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
