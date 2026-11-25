import * as v from "valibot";

import { SEARCHABLE_TYPES } from "#/lib/media-types";
import { m } from "#/paraglide/messages.js";

/** Kinds of Discover rows (decided 2026-11-24): the built-in ones and custom searches. */
export const DISCOVER_ROW_KINDS = [
  "recently_added",
  "recent_requests",
  "trending",
  "search",
  "genres",
  "upcoming",
] as const;

export const DiscoverRowSchema = v.object({
  id: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
  kind: v.picklist(DISCOVER_ROW_KINDS),
  enabled: v.boolean(),
  /** trending / search / genres: which format (upcoming: books only, Audible can't list them). */
  type: v.optional(v.picklist(SEARCHABLE_TYPES)),
  /** search: what to search, and the row's title. */
  query: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  title: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80))),
});
export type DiscoverRow = v.InferOutput<typeof DiscoverRowSchema>;

export const DiscoverLayoutSchema = v.pipe(v.array(DiscoverRowSchema), v.maxLength(30));

/** A custom search row as typed in the editor. */
export const NewSearchRowSchema = v.object({
  type: v.picklist(SEARCHABLE_TYPES),
  title: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(() => m.validation_required()),
    v.maxLength(80),
  ),
  query: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(() => m.validation_required()),
    v.maxLength(200),
  ),
});

export const DEFAULT_DISCOVER_LAYOUT: readonly DiscoverRow[] = [
  { id: "recently_added", kind: "recently_added", enabled: true },
  { id: "recent_requests", kind: "recent_requests", enabled: true },
  // Audiobooks together, then books: each format's rows read as one block.
  { id: "trending_audiobook", kind: "trending", type: "audiobook", enabled: true },
  { id: "genres_audiobook", kind: "genres", type: "audiobook", enabled: true },
  { id: "trending_ebook", kind: "trending", type: "ebook", enabled: true },
  { id: "genres_ebook", kind: "genres", type: "ebook", enabled: true },
  { id: "upcoming_ebook", kind: "upcoming", type: "ebook", enabled: true },
];

/**
 * A saved layout with the built-in rows it doesn't know yet (added in later
 * versions) appended, so new rows show up without resetting the layout.
 */
export function withNewBuiltInRows(saved: readonly DiscoverRow[]): DiscoverRow[] {
  const known = new Set(saved.map((row) => row.id));
  return [...saved, ...DEFAULT_DISCOVER_LAYOUT.filter((row) => !known.has(row.id))];
}
