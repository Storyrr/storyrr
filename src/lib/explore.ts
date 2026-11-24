import * as v from "valibot";

import { m } from "#/paraglide/messages.js";

/*
 * The Books / Audiobooks pages (Seerr's Movies / Series pages): many titles with
 * a sort and filters. Each catalog offers what its API supports (checked live
 * on 2026-11-24): Audible sorts and filters by genre, author, narrator,
 * publisher, but not by language; Hardcover filters by genre, year, pages,
 * rating and edition language.
 */

export const AUDIOBOOK_SORTS = [
  "bestsellers",
  "newest",
  "oldest",
  "rating",
  "title_asc",
  "title_desc",
  "longest",
  "shortest",
] as const;
export type AudiobookSort = (typeof AUDIOBOOK_SORTS)[number];

export const BOOK_SORTS = [
  "popular",
  "rating",
  "newest",
  "oldest",
  "title_asc",
  "title_desc",
] as const;
export type BookSort = (typeof BOOK_SORTS)[number];

export const sortLabels: Record<AudiobookSort | BookSort, () => string> = {
  bestsellers: m.explore_sort_bestsellers,
  popular: m.explore_sort_popular,
  newest: m.explore_sort_newest,
  oldest: m.explore_sort_oldest,
  rating: m.explore_sort_rating,
  title_asc: m.explore_sort_title_asc,
  title_desc: m.explore_sort_title_desc,
  longest: m.explore_sort_longest,
  shortest: m.explore_sort_shortest,
};

const text = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)));
const year = v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3000)));
const pages = v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000)));

/** Shown whatever the catalog: Storyrr's own status and Chaptarr's languages. */
const CommonFilters = {
  /** Leave out what's already in the library, requested or blocked. */
  hideOwned: v.optional(v.boolean()),
  /** Leave out what Chaptarr's language profile would refuse. */
  acceptedOnly: v.optional(v.boolean()),
};

/** Audible: one genre (category id), and contributors by name. */
export const AudiobookFiltersSchema = v.object({
  sort: v.optional(v.picklist(AUDIOBOOK_SORTS)),
  genre: v.optional(v.pipe(v.string(), v.regex(/^\d{1,20}$/))),
  author: text,
  narrator: text,
  publisher: text,
  ...CommonFilters,
});
export type AudiobookFilters = v.InferOutput<typeof AudiobookFiltersSchema>;

/** Hardcover: genres (tag slugs, any of them), year and page ranges, rating, edition language. */
export const BookFiltersSchema = v.object({
  sort: v.optional(v.picklist(BOOK_SORTS)),
  genres: v.optional(v.pipe(v.array(v.pipe(v.string(), v.maxLength(100))), v.maxLength(10))),
  yearFrom: year,
  yearTo: year,
  pagesMin: pages,
  pagesMax: pages,
  ratingMin: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(5))),
  /** ISO 639-1 code of an edition's language. */
  language: v.optional(v.pipe(v.string(), v.regex(/^[a-z]{2}$/))),
  ...CommonFilters,
});
export type BookFilters = v.InferOutput<typeof BookFiltersSchema>;

/**
 * Reads filters from the URL leniently: a value that doesn't fit (old or
 * hand-edited link) is dropped instead of failing the page. Dropped keys are
 * returned as undefined: TanStack Router merges the raw search params under
 * the validated ones, so an omitted key would come back unvalidated.
 */
export function readFilters<TEntries extends v.ObjectEntries>(
  schema: v.ObjectSchema<TEntries, undefined>,
  search: Record<string, unknown>,
): v.InferOutput<v.ObjectSchema<TEntries, undefined>> {
  const valid: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(schema.entries)) {
    const result = v.safeParse(entry, search[key]);
    // Every key, even unset: the router merges the raw URL under this result.
    valid[key] = result.success ? result.output : undefined;
  }
  return v.parse(schema, valid);
}

/** Slider bounds of the Books filters: at a bound, the filter is off. */
export const YEAR_RANGE = [1900, new Date().getFullYear()] as const;
export const PAGES_RANGE = [0, 1500] as const;

/** Titles per page of the Books / Audiobooks lists. */
export const EXPLORE_PAGE_SIZE = 40;

/** Languages offered by the Books language filter (ISO 639-1). */
export const EXPLORE_LANGUAGES = [
  "en",
  "fr",
  "de",
  "es",
  "it",
  "pt",
  "nl",
  "pl",
  "ru",
  "ja",
  "ko",
  "zh",
] as const;

const isSet = (value: unknown) =>
  value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0);

/** How many Audiobooks filters are set (sort and Storyrr's switches excluded), for the Filters button. */
export function audiobookFilterCount(f: AudiobookFilters): number {
  return [f.genre, f.author, f.narrator, f.publisher].filter(isSet).length;
}

/** How many Books filters are set; a range counts once. */
export function bookFilterCount(f: BookFilters): number {
  return [
    f.genres,
    isSet(f.yearFrom) || isSet(f.yearTo) ? true : undefined,
    isSet(f.pagesMin) || isSet(f.pagesMax) ? true : undefined,
    f.ratingMin,
    f.language,
  ].filter(isSet).length;
}
