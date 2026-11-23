import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { getMedia, searchMedia } from "#/functions/media.functions";
import type { SearchableType } from "#/lib/media-types";

export const mediaKeys = {
  all: ["media"] as const,
  search: (type: SearchableType, query: string) =>
    [...mediaKeys.all, "search", type, query] as const,
  detail: (type: SearchableType, id: string) => [...mediaKeys.all, "detail", type, id] as const,
};

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
