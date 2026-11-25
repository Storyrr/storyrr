import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { isLanguageAccepted, type LanguagePolicy } from "#/lib/languages";
import { DEFAULT_DISCOVER_LAYOUT, DiscoverLayoutSchema, withNewBuiltInRows } from "#/lib/discover";
import { hasPermission } from "#/lib/permissions";
import { AudiobookFiltersSchema, BookFiltersSchema } from "#/lib/explore";
import type { MediaSummary, MediaTag, SeriesSummary } from "#/lib/media";
import { SEARCHABLE_TYPES, type SearchableType } from "#/lib/media-types";
import { availabilityFromRequest, type MediaAvailability } from "#/lib/request-status";
import type { RequestStatus } from "#/lib/requests";
import { MediaRefSchema, SearchInputSchema } from "#/lib/schemas/requests";
import { requirePermission, requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { blockedIds, findBlock } from "#/server/requests/blocklist";
import { getLanguagePolicy } from "#/server/requests/language-policy";
import { clearTitleData, markAvailable, titleAdminInfo } from "#/server/requests/manage";
import { activeRequestsByExternalId, upsertMedia } from "#/server/requests/queries";
import { services } from "#/server/services";
import { fail, ok, type ServiceResult } from "#/server/services/result";
import { settings } from "#/server/settings";
import { discoverLayout } from "#/server/settings/definitions";
import { mediaSources } from "#/server/sources";

/** Accepted (true) first, then unknown (null), then refused (false); stable otherwise. */
const ACCEPTANCE_ORDER = new Map<boolean | null, number>([
  [true, 0],
  [null, 1],
  [false, 2],
]);

const languageInfo = (policy: LanguagePolicy | null) => ({
  acceptedLanguages: policy?.allowed ?? null,
});

/** In the library first, then blocked, then the state of its active request. */
function availabilityOf(
  externalId: string,
  owned: Set<string>,
  blocked: Set<string>,
  status: RequestStatus | undefined,
): MediaAvailability {
  if (owned.has(externalId)) return "available";
  const fromRequest = availabilityFromRequest(status);
  return fromRequest === "none" && blocked.has(externalId) ? "blocked" : fromRequest;
}

/** Each item's status for this library and Chaptarr's language acceptance; accepted first. */
async function annotate(type: SearchableType, items: MediaSummary[], sortAccepted = true) {
  const source = mediaSources[type];
  const policy = await getLanguagePolicy({ services, settings }, type);
  const owned = source.owned(db, items);
  const requests = activeRequestsByExternalId(db, {
    source: source.source,
    format: source.type,
    externalIds: items.map((item) => item.externalId),
  });
  const blocked = blockedIds(
    db,
    source.source,
    items.map((item) => item.externalId),
  );
  const results = items.map((item) => ({
    ...item,
    availability: availabilityOf(
      item.externalId,
      owned,
      blocked,
      requests.get(item.externalId)?.status,
    ),
    /** Whether Chaptarr's metadata profile accepts the work's languages (null: can't tell). */
    accepted: isLanguageAccepted(policy, item.languages),
  }));
  // Array.prototype.sort is stable: provider order is kept within each group.
  if (sortAccepted)
    results.sort(
      (x, y) => (ACCEPTANCE_ORDER.get(x.accepted) ?? 1) - (ACCEPTANCE_ORDER.get(y.accepted) ?? 1),
    );
  return { ok: true as const, results, ...languageInfo(policy) };
}

/** Search one media type, with each result's status for this library. Signed-in users. */
export const searchMedia = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(SearchInputSchema)
  .handler(async ({ data }) => {
    const result = await mediaSources[data.type].search(services, data.query);
    if (!result.ok) return { ok: false as const, error: result.error };
    return annotate(data.type, result.value);
  });

const TRENDING_TTL_MS = 30 * 60_000;
const trendingCache = new Map<string, { at: number; items: MediaSummary[] }>();

/** What's popular (Audible bestsellers, Hardcover trending), shared between users for 30 min. */
export const getTrending = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(
    v.object({
      type: v.picklist(SEARCHABLE_TYPES),
      page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)), 1),
    }),
  )
  .handler(async ({ data }) => {
    const key = `${data.type}:${data.page}`;
    const cached = trendingCache.get(key);
    let items = cached && Date.now() - cached.at < TRENDING_TTL_MS ? cached.items : null;
    if (!items) {
      const result = await mediaSources[data.type].trending(services, data.page);
      if (!result.ok) return { ok: false as const, error: result.error };
      items = result.value;
      trendingCache.set(key, { at: Date.now(), items });
    }
    return annotate(data.type, items);
  });

/** One item with its status, who requested it, and whether a request is auto-approved. */
export const getMedia = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(MediaRefSchema)
  .handler(async ({ data, context }) => {
    const source = mediaSources[data.type];
    const [result, policy] = await Promise.all([
      source.getDetails(services, data.id),
      getLanguagePolicy({ services, settings }, data.type),
    ]);
    if (!result.ok) return { ok: false as const, error: result.error };
    const owned = source.owned(db, [result.value]).has(result.value.externalId);
    const block = findBlock(db, source.source, result.value.externalId);
    const active = activeRequestsByExternalId(db, {
      source: source.source,
      format: source.type,
      externalIds: [result.value.externalId],
    }).get(result.value.externalId);
    return {
      ok: true as const,
      item: result.value,
      availability: availabilityOf(
        result.value.externalId,
        owned ? new Set([result.value.externalId]) : new Set<string>(),
        block ? new Set([result.value.externalId]) : new Set<string>(),
        active?.status,
      ),
      request: active ? { status: active.status, requesterName: active.requesterName } : null,
      block: block ? { id: block.id, reason: block.reason } : null,
      canRequest: hasPermission(context.permissions, `request_${data.type}`),
      autoApproved: hasPermission(context.permissions, `auto_approve_${data.type}`),
      accepted: isLanguageAccepted(policy, result.value.languages),
      ...languageInfo(policy),
    };
  });

/** Admin panel of a title: its requests, issues and manual availability. Request managers. */
export const getTitleAdmin = createServerFn({ method: "GET" })
  .middleware([requirePermission("manage_requests")])
  .validator(MediaRefSchema)
  .handler(({ data }) => titleAdminInfo(db, mediaSources[data.type].source, data.id));

/** Marks a title as in the library (when the sync can't match it), fulfilling its requests. */
export const markTitleAvailable = createServerFn({ method: "POST" })
  .middleware([requirePermission("manage_requests")])
  .validator(MediaRefSchema)
  .handler(async ({ data, context }) => {
    const details = await mediaSources[data.type].getDetails(services, data.id);
    if (!details.ok) throw new Error(details.error.message);
    upsertMedia(db, details.value);
    return { fulfilled: markAvailable(db, details.value, context.session.user.id) };
  });

/** Forgets a title's requests, issues and manual availability (Chaptarr and libraries untouched). */
export const clearTitle = createServerFn({ method: "POST" })
  .middleware([requirePermission("manage_requests")])
  .validator(MediaRefSchema)
  .handler(({ data }) => {
    clearTitleData(db, mediaSources[data.type].source, data.id);
    return { ok: true };
  });

const CollectionInputSchema = v.object({
  type: v.picklist(SEARCHABLE_TYPES),
  id: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
  /** Author name (Audible finds an author's books by name). */
  name: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
});

/** A series page: its works in order, each with its status. Signed-in users. */
export const getSeries = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(CollectionInputSchema)
  .handler(async ({ data }) => {
    const result = await mediaSources[data.type].series(services, data.id);
    if (!result.ok) return { ok: false as const, error: result.error };
    const { name, description, imageUrl, items, collections = [], tags = [] } = result.value;
    const [volumes, sets] = await Promise.all([
      annotate(data.type, items, false),
      annotate(data.type, collections, false),
    ]);
    return { ...volumes, collections: sets.results, tags, name, description, imageUrl };
  });

/** Each series with Chaptarr's language acceptance (from its first books). */
async function annotateSeries(type: SearchableType, series: SeriesSummary[]) {
  const policy = await getLanguagePolicy({ services, settings }, type);
  return {
    policy,
    results: series.map((item) => ({
      ...item,
      accepted: isLanguageAccepted(policy, item.languages),
    })),
  };
}

/** Series matching a search (Hardcover), accepted languages first. Signed-in users. */
export const searchSeries = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(SearchInputSchema)
  .handler(async ({ data }) => {
    const result = await mediaSources[data.type].searchSeries(services, data.query);
    if (!result.ok) return { ok: false as const, error: result.error };
    const { policy, results } = await annotateSeries(data.type, result.value);
    results.sort(
      (x, y) => (ACCEPTANCE_ORDER.get(x.accepted) ?? 1) - (ACCEPTANCE_ORDER.get(y.accepted) ?? 1),
    );
    return { ok: true as const, results, ...languageInfo(policy) };
  });

/**
 * A series' other versions in a language Chaptarr accepts (e.g. a translation
 * numbered apart), each with those languages only. Signed-in users.
 */
export const getRelatedSeries = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(
    v.object({
      type: v.picklist(SEARCHABLE_TYPES),
      id: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
      name: v.pipe(v.string(), v.nonEmpty(), v.maxLength(300)),
    }),
  )
  .handler(async ({ data }) => {
    const result = await mediaSources[data.type].relatedSeries(services, data.id, data.name);
    // A hint, not the page's content: no error shown when it fails.
    if (!result.ok) return [];
    const { policy, results } = await annotateSeries(data.type, result.value);
    if (!policy) return [];
    return results
      .filter((series) => series.accepted === true)
      .map((series) => ({
        ...series,
        languages: (series.languages ?? []).filter(
          (code): code is string => code !== null && policy.allowed.includes(code),
        ),
      }));
  });

/** The Books / Audiobooks page: the catalog sorted and filtered, each title with its status. */
export const exploreMedia = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(
    v.variant("type", [
      v.object({
        type: v.literal("audiobook"),
        filters: AudiobookFiltersSchema,
        page: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
      }),
      v.object({
        type: v.literal("ebook"),
        filters: BookFiltersSchema,
        page: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
      }),
    ]),
  )
  .handler(async ({ data }) => {
    let result: ServiceResult<MediaSummary[]>;
    if (data.type === "audiobook") {
      result = await (await services.audible()).discover(data.filters, data.page);
    } else {
      const hardcover = await services.hardcover();
      result = hardcover
        ? await hardcover.discover(data.filters, data.page)
        : fail("not_configured", "Hardcover token missing");
    }
    if (!result.ok) return { ok: false as const, error: result.error };
    // The chosen sort is the order: no regrouping by language acceptance.
    return annotate(data.type, result.value, false);
  });

const GENRES_TTL_MS = 24 * 60 * 60_000;
const genresCache = new Map<SearchableType, { at: number; genres: MediaTag[] }>();

/** The genres the Books / Audiobooks genre filter offers, shared between users for a day. */
export const getGenreOptions = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(v.object({ type: v.picklist(SEARCHABLE_TYPES) }))
  .handler(async ({ data }) => {
    const cached = genresCache.get(data.type);
    if (cached && Date.now() - cached.at < GENRES_TTL_MS) return cached.genres;
    let result: ServiceResult<MediaTag[]>;
    if (data.type === "audiobook") result = await (await services.audible()).genres();
    else {
      const hardcover = await services.hardcover();
      result = hardcover ? await hardcover.genres() : ok([]);
    }
    // No genres is not an error worth a message: the filter just stays empty.
    if (!result.ok) return [];
    genresCache.set(data.type, { at: Date.now(), genres: result.value });
    return result.value;
  });

/** A genre's or keyword's page: its titles, most popular first, each with its status. Signed-in users. */
export const getTagged = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(
    v.object({
      type: v.picklist(SEARCHABLE_TYPES),
      id: v.pipe(v.string(), v.nonEmpty(), v.maxLength(200)),
      page: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(25)),
    }),
  )
  .handler(async ({ data }) => {
    const result = await mediaSources[data.type].tag(services, data.id, data.page);
    if (!result.ok) return { ok: false as const, error: result.error };
    // Popularity order: no regrouping by language acceptance.
    return { ...(await annotate(data.type, result.value.items, false)), name: result.value.name };
  });

/** An author page: bio and works, each with its status. Signed-in users. */
export const getAuthor = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(CollectionInputSchema)
  .handler(async ({ data }) => {
    const result = await mediaSources[data.type].author(services, data.id, data.name);
    if (!result.ok) return { ok: false as const, error: result.error };
    const { name, description, imageUrl } = result.value;
    return { ...(await annotate(data.type, result.value.items)), name, description, imageUrl };
  });

/** Discover's rows, in order. Signed-in users (everyone sees the same Discover). */
export const getDiscoverLayout = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => {
    const saved = await settings.get(discoverLayout);
    return saved ? withNewBuiltInRows(saved) : [...DEFAULT_DISCOVER_LAYOUT];
  });

/** Saves Discover's rows (null: back to the default). Manage settings. */
export const saveDiscoverLayout = createServerFn({ method: "POST" })
  .middleware([requirePermission("manage_settings")])
  .validator(v.object({ rows: v.nullable(DiscoverLayoutSchema) }))
  .handler(async ({ data }) => {
    if (data.rows) await settings.set(discoverLayout, data.rows);
    else await settings.remove(discoverLayout);
    return { ok: true };
  });
