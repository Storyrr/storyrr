import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  getAuthor,
  getDiscoverLayout,
  getMedia,
  getSeries,
  getTitleAdmin,
  exploreMedia,
  getGenreOptions,
  getTagged,
  getTrending,
  searchMedia,
} from "#/functions/media.functions";
import type { AudiobookFilters, BookFilters } from "#/lib/explore";
import type { SearchableType } from "#/lib/media-types";

export const mediaKeys = {
  all: ["media"] as const,
  search: (type: SearchableType, query: string) =>
    [...mediaKeys.all, "search", type, query] as const,
  detail: (type: SearchableType, id: string) => [...mediaKeys.all, "detail", type, id] as const,
  admin: (type: SearchableType, id: string) => [...mediaKeys.all, "admin", type, id] as const,
  series: (type: SearchableType, id: string) => [...mediaKeys.all, "series", type, id] as const,
  author: (type: SearchableType, id: string) => [...mediaKeys.all, "author", type, id] as const,
};

export const seriesQuery = (type: SearchableType, id: string) =>
  queryOptions({
    queryKey: mediaKeys.series(type, id),
    queryFn: () => getSeries({ data: { type, id } }),
    staleTime: 5 * 60_000,
  });

/** `name`: Audible looks an author's books up by name. */
export const authorQuery = (type: SearchableType, id: string, name: string) =>
  queryOptions({
    queryKey: mediaKeys.author(type, id),
    queryFn: () => getAuthor({ data: { type, id, name } }),
    staleTime: 5 * 60_000,
  });

export const titleAdminQuery = (type: SearchableType, id: string) =>
  queryOptions({
    queryKey: mediaKeys.admin(type, id),
    queryFn: () => getTitleAdmin({ data: { type, id } }),
  });

export const mediaSearchQuery = (type: SearchableType, query: string) =>
  queryOptions({
    queryKey: mediaKeys.search(type, query),
    queryFn: () => searchMedia({ data: { type, query } }),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

/** The id is validated server-side per type (ASIN for audiobooks, Hardcover id for eBooks). */
export const mediaQuery = (type: SearchableType, id: string) =>
  queryOptions({
    queryKey: mediaKeys.detail(type, id),
    queryFn: () => getMedia({ data: { type, id } }),
    staleTime: 60_000,
  });

export const trendingQuery = (type: SearchableType) =>
  queryOptions({
    queryKey: [...mediaKeys.all, "trending", type] as const,
    queryFn: () => getTrending({ data: { type } }),
    staleTime: 10 * 60_000,
  });

/** Browse: the trending list page by page (Audible has more pages, Hardcover one). */
export const trendingPagesQuery = (type: SearchableType) =>
  infiniteQueryOptions({
    queryKey: [...mediaKeys.all, "trending", type, "pages"] as const,
    queryFn: ({ pageParam }) => getTrending({ data: { type, page: pageParam } }),
    initialPageParam: 1,
    getNextPageParam: (last, _all, page) =>
      last.ok && last.results.length > 0 && page < 50 ? page + 1 : undefined,
    staleTime: 10 * 60_000,
  });

/** A genre's or keyword's titles, page by page. */
export const taggedPagesQuery = (type: SearchableType, id: string) =>
  infiniteQueryOptions({
    queryKey: [...mediaKeys.all, "tag", type, id] as const,
    queryFn: ({ pageParam }) => getTagged({ data: { type, id, page: pageParam } }),
    initialPageParam: 1,
    getNextPageParam: (last, _all, page) =>
      last.ok && last.results.length > 0 && page < 25 ? page + 1 : undefined,
    staleTime: 10 * 60_000,
  });

/** The Books / Audiobooks page with its filters, page by page. */
export const exploreQuery = (
  input: { type: "audiobook"; filters: AudiobookFilters } | { type: "ebook"; filters: BookFilters },
) =>
  infiniteQueryOptions({
    queryKey: [...mediaKeys.all, "explore", input.type, input.filters] as const,
    queryFn: ({ pageParam }) => exploreMedia({ data: { ...input, page: pageParam } }),
    initialPageParam: 1,
    getNextPageParam: (last, _all, page) =>
      last.ok && last.results.length > 0 && page < 50 ? page + 1 : undefined,
    staleTime: 10 * 60_000,
  });

/** The Discover "Upcoming books" row: the first page of the Upcoming sort. */
export const upcomingBooksQuery = () =>
  queryOptions({
    queryKey: [...mediaKeys.all, "upcoming", "ebook"] as const,
    queryFn: () =>
      exploreMedia({ data: { type: "ebook", filters: { sort: "upcoming" }, page: 1 } }),
    staleTime: 30 * 60_000,
  });

export const genreOptionsQuery = (type: SearchableType) =>
  queryOptions({
    queryKey: [...mediaKeys.all, "genres", type] as const,
    queryFn: () => getGenreOptions({ data: { type } }),
    staleTime: 60 * 60_000,
  });

export const discoverLayoutQuery = () =>
  queryOptions({
    queryKey: ["discover", "layout"] as const,
    queryFn: () => getDiscoverLayout(),
    staleTime: 5 * 60_000,
  });
