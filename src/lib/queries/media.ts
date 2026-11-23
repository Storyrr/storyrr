import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { getAudiobook, searchAudiobooks } from "#/functions/media.functions";

export const mediaKeys = {
  all: ["media"] as const,
  search: (query: string) => [...mediaKeys.all, "search", "audiobook", query] as const,
  detail: (type: "audiobook", id: string) => [...mediaKeys.all, "detail", type, id] as const,
};

export const audiobookSearchQuery = (query: string) =>
  queryOptions({
    queryKey: mediaKeys.search(query),
    queryFn: () => searchAudiobooks({ data: { query } }),
    enabled: query.trim().length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

export const audiobookQuery = (asin: string) =>
  queryOptions({
    queryKey: mediaKeys.detail("audiobook", asin),
    queryFn: () => getAudiobook({ data: { asin } }),
    staleTime: 60_000,
  });
