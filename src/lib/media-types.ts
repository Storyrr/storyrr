import type { MediaType } from "#/lib/requests";

/** Media types Storyrr can search and request. */
export const SEARCHABLE_TYPES = [
  "audiobook",
  "ebook",
  "podcast",
] as const satisfies readonly MediaType[];
export type SearchableType = (typeof SEARCHABLE_TYPES)[number];

export const isSearchableType = (value: string): value is SearchableType =>
  SEARCHABLE_TYPES.some((type) => type === value);

/** Types Chaptarr fetches (podcasts go to Audiobookshelf). */
export const isChaptarrType = (type: SearchableType): type is "audiobook" | "ebook" =>
  type !== "podcast";
