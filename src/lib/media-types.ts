import type { MediaType } from "#/lib/requests";

/** Media types Storyrr can search and request. */
export const SEARCHABLE_TYPES = ["audiobook", "ebook"] as const satisfies readonly MediaType[];
export type SearchableType = (typeof SEARCHABLE_TYPES)[number];

export const isSearchableType = (value: string): value is SearchableType =>
  SEARCHABLE_TYPES.some((type) => type === value);

/** Each format's badge color (title and series cards, title and series pages). */
export const FORMAT_BADGE: Record<SearchableType, string> = {
  audiobook: "bg-format-audiobook text-white",
  ebook: "bg-format-ebook text-white",
};
