import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type {
  MediaCollection,
  MediaDetails,
  MediaSummary,
  MediaTag,
  MediaTagPage,
} from "#/lib/media";
import { fail, ok, requestJson, type FetchFn, type ServiceResult } from "#/server/services/result";

import { audibleHost, type AudibleRegion } from "#/lib/audible-regions";
import { EXPLORE_PAGE_SIZE, type AudiobookFilters, type AudiobookSort } from "#/lib/explore";
import { canonicalLanguage } from "#/lib/languages";
import { isCollectionPosition, seriesTags } from "#/lib/series";
import { htmlToText } from "#/server/services/text";

const RESPONSE_GROUPS =
  "contributors,media,product_attrs,product_desc,product_extended_attrs,series";

const ProductSchema = v.object({
  asin: v.string(),
  title: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  authors: v.optional(v.array(v.object({ name: v.string(), asin: v.optional(v.string()) })), []),
  narrators: v.optional(v.array(v.object({ name: v.string() })), []),
  publisher_name: v.optional(v.string()),
  release_date: v.optional(v.string()),
  runtime_length_min: v.optional(v.number()),
  language: v.optional(v.string()),
  series: v.optional(
    v.array(
      v.object({
        title: v.string(),
        sequence: v.optional(v.string()),
        asin: v.optional(v.string()),
      }),
    ),
    [],
  ),
  product_images: v.optional(v.record(v.string(), v.string()), {}),
  publisher_summary: v.optional(v.string()),
  merchandising_summary: v.optional(v.string()),
  /** Genre paths ("Science fiction › Space opera"), verified on api.audible.fr on 2026-11-24. */
  category_ladders: v.optional(
    v.array(v.object({ ladder: v.array(v.object({ id: v.string(), name: v.string() })) })),
    [],
  ),
});
type Product = v.InferOutput<typeof ProductSchema>;

const SearchResponseSchema = v.object({
  products: v.array(ProductSchema),
  total_results: v.optional(v.number()),
});
const ProductResponseSchema = v.object({ product: ProductSchema });

const CategorySchema = v.object({ category: v.object({ id: v.string(), name: v.string() }) });
const RootCategoriesSchema = v.object({
  categories: v.array(v.object({ id: v.string(), name: v.string() })),
});

/** Audible's sort names (`products_sort_by`; it has no descending rating). */
const AUDIBLE_SORT: Record<AudiobookSort, string> = {
  bestsellers: "BestSellers",
  newest: "-ReleaseDate",
  oldest: "ReleaseDate",
  rating: "AvgRating",
  title_asc: "Title",
  title_desc: "-Title",
  longest: "-RuntimeLength",
  shortest: "RuntimeLength",
};

/** Titles per page of a genre. */
const CATEGORY_PAGE = 40;

/** A series is a product whose children are its volumes (verified on api.audible.fr, 2026-11-24). */
const SeriesResponseSchema = v.object({
  product: v.object({
    asin: v.string(),
    title: v.optional(v.string()),
    publisher_summary: v.optional(v.string()),
    relationships: v.optional(
      v.array(
        v.object({
          asin: v.string(),
          relationship_to_product: v.optional(v.string()),
          relationship_type: v.optional(v.string()),
          sequence: v.optional(v.string()),
          sort: v.optional(v.string()),
        }),
      ),
      [],
    ),
  }),
});

/** Audnexus author profile (bio and photo; looked up by the author's ASIN). */
const AudnexusAuthorSchema = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  image: v.optional(v.string()),
});

/** Products per batch lookup (`?asins=`). */
const BATCH = 50;

/**
 * Audible's catalog API (undocumented, no key). Shapes verified against
 * api.audible.fr on 2026-11-23; fixtures in ./fixtures are trimmed recordings.
 */
export function createAudibleClient({ fetch, region }: { fetch: FetchFn; region: AudibleRegion }) {
  const base = `https://${audibleHost(region)}/1.0/catalog/products`;

  /** Several products by ASIN, in the given order (unknown ones left out). */
  async function byAsins(
    asins: readonly string[],
    { withGenres = false } = {},
  ): Promise<ServiceResult<(MediaSummary & { tags?: MediaTag[] })[]>> {
    const found = new Map<string, MediaSummary & { tags?: MediaTag[] }>();
    for (let i = 0; i < asins.length; i += BATCH) {
      const result = await list({ asins: asins.slice(i, i + BATCH).join(",") }, BATCH, {
        withGenres,
      });
      if (!result.ok) return result;
      for (const item of result.value) found.set(item.externalId, item);
    }
    return ok(asins.flatMap((asin) => found.get(asin) ?? []));
  }

  async function list(
    params: Record<string, string>,
    limit: number,
    { withGenres = false } = {},
  ): Promise<ServiceResult<(MediaSummary & { tags?: MediaTag[] })[]>> {
    const url = new URL(base);
    url.search = new URLSearchParams({
      ...params,
      num_results: String(limit),
      response_groups: withGenres ? `${RESPONSE_GROUPS},category_ladders` : RESPONSE_GROUPS,
      image_sizes: "500",
    }).toString();
    const result = await requestJson({
      fetch,
      service: "Audible",
      url,
      schema: SearchResponseSchema,
    });
    if (!result.ok) return result;
    return ok(
      result.value.products.flatMap((product) => {
        const summary = toSummary(product);
        if (!summary) return [];
        return withGenres ? [{ ...summary, tags: genres(product) }] : [summary];
      }),
    );
  }

  return {
    async search(query: string, { limit = 20 } = {}): Promise<ServiceResult<MediaSummary[]>> {
      return list({ keywords: query, products_sort_by: "Relevance" }, limit);
    },

    /** The region's bestsellers (verified on api.audible.fr: no keywords, sorted by BestSellers). */
    async bestsellers({ limit = 20, page = 1 } = {}): Promise<ServiceResult<MediaSummary[]>> {
      // Audible pages from 0.
      return list({ products_sort_by: "BestSellers", page: String(page - 1) }, limit);
    },

    /** A series' volumes in reading order (its children, sorted by Audible's `sort`). */
    async series(asin: string): Promise<ServiceResult<MediaCollection>> {
      const url = new URL(`${base}/${encodeURIComponent(asin)}`);
      url.search = new URLSearchParams({
        response_groups: "relationships,product_desc,product_attrs",
      }).toString();
      const result = await requestJson({
        fetch,
        service: "Audible",
        url,
        schema: SeriesResponseSchema,
      });
      if (!result.ok) return result;
      const { product } = result.value;
      if (!product.title) return fail("not_found", `Audible has no series ${asin}`);
      const children = product.relationships
        .filter((r) => r.relationship_to_product === "child" && r.relationship_type === "series")
        .toSorted((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
      const items = await byAsins(
        children.map((r) => r.asin),
        { withGenres: true },
      );
      if (!items.ok) return items;
      // Box sets ("Books 1-3") are children too: kept apart from the volumes.
      const isCollection = (item: MediaSummary) =>
        isCollectionPosition(item.series.find((s) => s.id === asin)?.position);
      return ok({
        name: product.title,
        description: product.publisher_summary ? htmlToText(product.publisher_summary) : undefined,
        items: items.value.filter((item) => !isCollection(item)).map(withoutTags),
        collections: items.value.filter(isCollection).map(withoutTags),
        tags: seriesTags(
          items.value.filter((item) => !isCollection(item)).map((item) => item.tags ?? []),
        ),
      });
    },

    /**
     * An author's audiobooks (catalog search by name, kept when the author ASIN
     * matches), with their bio and photo from Audnexus when it has them.
     */
    async author(asin: string, name: string): Promise<ServiceResult<MediaCollection>> {
      const books = await list({ author: name, products_sort_by: "Relevance" }, 50);
      if (!books.ok) return books;
      const profile = await requestJson({
        fetch,
        service: "Audnexus",
        url: new URL(`https://api.audnex.us/authors/${encodeURIComponent(asin)}?region=${region}`),
        schema: AudnexusAuthorSchema,
      });
      return ok({
        name: (profile.ok ? profile.value.name : undefined) ?? name,
        description:
          profile.ok && profile.value.description
            ? htmlToText(profile.value.description)
            : undefined,
        imageUrl: profile.ok ? profile.value.image : undefined,
        items: books.value.filter((book) => book.authorRefs?.some((a) => a.id === asin)),
      });
    },

    async getByAsin(asin: string): Promise<ServiceResult<MediaDetails>> {
      const url = new URL(`${base}/${encodeURIComponent(asin)}`);
      url.search = new URLSearchParams({
        response_groups: `${RESPONSE_GROUPS},category_ladders`,
        image_sizes: "500",
      }).toString();
      const result = await requestJson({
        fetch,
        service: "Audible",
        url,
        schema: ProductResponseSchema,
      });
      if (!result.ok) return result;
      const summary = toSummary(result.value.product);
      // Unknown ASINs come back as 200 with a bare product (no title).
      if (!summary) return fail("not_found", `Audible has no audiobook ${asin}`);
      const html =
        result.value.product.publisher_summary ?? result.value.product.merchandising_summary;
      return ok({
        ...summary,
        description: html ? htmlToText(html) : undefined,
        tags: genres(result.value.product),
      });
    },

    /** The catalog sorted and filtered (Books / Audiobooks page), page by page. */
    async discover(filters: AudiobookFilters, page = 1): Promise<ServiceResult<MediaSummary[]>> {
      const params: Record<string, string> = {
        products_sort_by: AUDIBLE_SORT[filters.sort ?? "bestsellers"],
        // Audible pages from 0.
        page: String(page - 1),
      };
      if (filters.genre) params.category_id = filters.genre;
      if (filters.author) params.author = filters.author;
      if (filters.narrator) params.narrator = filters.narrator;
      if (filters.publisher) params.publisher = filters.publisher;
      return list(params, EXPLORE_PAGE_SIZE);
    },

    /** The top-level genres (verified on api.audible.fr: `?root=Genres`, 24 in France). */
    async genres(): Promise<ServiceResult<MediaTag[]>> {
      const url = new URL(`https://${audibleHost(region)}/1.0/catalog/categories`);
      url.search = new URLSearchParams({ root: "Genres" }).toString();
      const result = await requestJson({
        fetch,
        service: "Audible",
        url,
        schema: RootCategoriesSchema,
      });
      if (!result.ok) return result;
      return ok(result.value.categories.map((c) => ({ id: c.id, name: c.name })));
    },

    /** A genre's bestsellers, page by page (Audible pages from 0), with the genre's name. */
    async category(id: string, page = 1): Promise<ServiceResult<MediaTagPage>> {
      const info = await requestJson({
        fetch,
        service: "Audible",
        url: new URL(
          `https://${audibleHost(region)}/1.0/catalog/categories/${encodeURIComponent(id)}`,
        ),
        schema: CategorySchema,
      });
      if (!info.ok) return info;
      const items = await list(
        { category_id: id, products_sort_by: "BestSellers", page: String(page - 1) },
        CATEGORY_PAGE,
      );
      if (!items.ok) return items;
      return ok({ name: info.value.category.name, items: items.value });
    },
  };
}

export type AudibleClient = ReturnType<typeof createAudibleClient>;

/** Contributors listed with a role suffix ("Name - traducteur") are not authors. */
const ROLE_SUFFIX = / - [^-]+$/;

/** A list item without the genres fetched for its series' tags. */
const withoutTags = ({ tags: _tags, ...item }: MediaSummary & { tags?: MediaTag[] }) => item;

/** A product's genres, broadest first, each once (only with the `category_ladders` group). */
function genres(product: Product): MediaTag[] {
  const tags = new Map<string, MediaTag>();
  for (const { ladder } of product.category_ladders)
    for (const node of ladder) tags.set(node.id, { id: node.id, name: node.name });
  return [...tags.values()];
}

function toSummary(product: Product): MediaSummary | null {
  if (!product.title) return null;
  return {
    type: "audiobook",
    source: "audible",
    externalId: product.asin,
    title: product.title,
    subtitle: product.subtitle,
    authors: product.authors.map((a) => a.name).filter((name) => !ROLE_SUFFIX.test(name)),
    authorRefs: product.authors.flatMap((a) =>
      a.asin && !ROLE_SUFFIX.test(a.name) ? [{ id: a.asin, name: a.name }] : [],
    ),
    narrators: product.narrators.map((n) => n.name),
    publisher: product.publisher_name,
    releaseDate: product.release_date,
    series: product.series.map((s) => ({
      name: s.title,
      position: s.sequence || undefined,
      id: s.asin,
    })),
    coverUrl: product.product_images["500"] ?? Object.values(product.product_images)[0],
    language: product.language,
    languages: product.language ? [canonicalLanguage(product.language)] : undefined,
    durationMinutes: product.runtime_length_min,
  };
}
