import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { MediaDetails, MediaSummary } from "#/lib/media";
import { fail, ok, requestJson, type FetchFn, type ServiceResult } from "#/server/services/result";

import { audibleHost, type AudibleRegion } from "#/lib/audible-regions";
import { canonicalLanguage } from "#/lib/languages";
import { htmlToText } from "#/server/services/text";

const RESPONSE_GROUPS =
  "contributors,media,product_attrs,product_desc,product_extended_attrs,series";

const ProductSchema = v.object({
  asin: v.string(),
  title: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  authors: v.optional(v.array(v.object({ name: v.string() })), []),
  narrators: v.optional(v.array(v.object({ name: v.string() })), []),
  publisher_name: v.optional(v.string()),
  release_date: v.optional(v.string()),
  runtime_length_min: v.optional(v.number()),
  language: v.optional(v.string()),
  series: v.optional(
    v.array(v.object({ title: v.string(), sequence: v.optional(v.string()) })),
    [],
  ),
  product_images: v.optional(v.record(v.string(), v.string()), {}),
  publisher_summary: v.optional(v.string()),
  merchandising_summary: v.optional(v.string()),
});
type Product = v.InferOutput<typeof ProductSchema>;

const SearchResponseSchema = v.object({
  products: v.array(ProductSchema),
  total_results: v.optional(v.number()),
});
const ProductResponseSchema = v.object({ product: ProductSchema });

/**
 * Audible's catalog API (undocumented, no key). Shapes verified against
 * api.audible.fr on 2026-11-23; fixtures in ./fixtures are trimmed recordings.
 */
export function createAudibleClient({ fetch, region }: { fetch: FetchFn; region: AudibleRegion }) {
  const base = `https://${audibleHost(region)}/1.0/catalog/products`;

  async function list(
    params: Record<string, string>,
    limit: number,
  ): Promise<ServiceResult<MediaSummary[]>> {
    const url = new URL(base);
    url.search = new URLSearchParams({
      ...params,
      num_results: String(limit),
      response_groups: RESPONSE_GROUPS,
      image_sizes: "500",
    }).toString();
    const result = await requestJson({
      fetch,
      service: "Audible",
      url,
      schema: SearchResponseSchema,
    });
    if (!result.ok) return result;
    return ok(result.value.products.flatMap((product) => toSummary(product) ?? []));
  }

  return {
    async search(query: string, { limit = 20 } = {}): Promise<ServiceResult<MediaSummary[]>> {
      return list({ keywords: query, products_sort_by: "Relevance" }, limit);
    },

    /** The region's bestsellers (verified on api.audible.fr: no keywords, sorted by BestSellers). */
    async bestsellers({ limit = 20 } = {}): Promise<ServiceResult<MediaSummary[]>> {
      return list({ products_sort_by: "BestSellers" }, limit);
    },

    async getByAsin(asin: string): Promise<ServiceResult<MediaDetails>> {
      const url = new URL(`${base}/${encodeURIComponent(asin)}`);
      url.search = new URLSearchParams({
        response_groups: RESPONSE_GROUPS,
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
      return ok({ ...summary, description: html ? htmlToText(html) : undefined });
    },
  };
}

export type AudibleClient = ReturnType<typeof createAudibleClient>;

/** Contributors listed with a role suffix ("Name - traducteur") are not authors. */
const ROLE_SUFFIX = / - [^-]+$/;

function toSummary(product: Product): MediaSummary | null {
  if (!product.title) return null;
  return {
    type: "audiobook",
    source: "audible",
    externalId: product.asin,
    title: product.title,
    subtitle: product.subtitle,
    authors: product.authors.map((a) => a.name).filter((name) => !ROLE_SUFFIX.test(name)),
    narrators: product.narrators.map((n) => n.name),
    publisher: product.publisher_name,
    releaseDate: product.release_date,
    series: product.series.map((s) => ({ name: s.title, position: s.sequence || undefined })),
    coverUrl: product.product_images["500"] ?? Object.values(product.product_images)[0],
    language: product.language,
    languages: product.language ? [canonicalLanguage(product.language)] : undefined,
    durationMinutes: product.runtime_length_min,
  };
}
