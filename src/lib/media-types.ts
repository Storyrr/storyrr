import type { MediaType } from "#/lib/requests";

/** Media types Storyrr can search and request so far (podcasts come with milestone 4). */
export const SEARCHABLE_TYPES = ["audiobook", "ebook"] as const satisfies readonly MediaType[];
export type SearchableType = (typeof SEARCHABLE_TYPES)[number];

export const isSearchableType = (value: string): value is SearchableType =>
  SEARCHABLE_TYPES.some((type) => type === value);
