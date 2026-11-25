import * as v from "valibot";

import { AudiobookFiltersSchema, BookFiltersSchema } from "#/lib/explore";
import { SEARCHABLE_TYPES } from "#/lib/media-types";
import { m } from "#/paraglide/messages.js";

/** Built-in Discover rows; admins add "filtered" rows (decided 2026-11-25, replacing search rows). */
export const BUILT_IN_ROW_KINDS = [
  "recently_added",
  "recent_requests",
  "trending",
  "genres",
  "upcoming",
] as const;

const rowId = v.pipe(v.string(), v.nonEmpty(), v.maxLength(64));

const BuiltInRowSchema = v.object({
  id: rowId,
  kind: v.picklist(BUILT_IN_ROW_KINDS),
  enabled: v.boolean(),
  /** trending / genres: which format (upcoming: books only, Audible can't list them). */
  type: v.optional(v.picklist(SEARCHABLE_TYPES)),
});

/** A filtered row's title. */
export const RowTitleSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty(() => m.validation_required()),
  v.maxLength(80),
);

/** A filtered row as typed in the editor: a title and the Books / Audiobooks sort and filters. */
export const NewFilteredRowSchema = v.variant("type", [
  v.object({
    type: v.literal("audiobook"),
    title: RowTitleSchema,
    filters: AudiobookFiltersSchema,
  }),
  v.object({ type: v.literal("ebook"), title: RowTitleSchema, filters: BookFiltersSchema }),
]);
export type NewFilteredRow = v.InferOutput<typeof NewFilteredRowSchema>;

const filteredRow = {
  id: rowId,
  kind: v.literal("filtered"),
  enabled: v.boolean(),
  title: RowTitleSchema,
};

/** A row showing the Books or Audiobooks page with a sort and filters ("See all" opens it). */
const FilteredRowSchema = v.variant("type", [
  v.object({ ...filteredRow, type: v.literal("audiobook"), filters: AudiobookFiltersSchema }),
  v.object({ ...filteredRow, type: v.literal("ebook"), filters: BookFiltersSchema }),
]);

export type FilteredDiscoverRow = v.InferOutput<typeof FilteredRowSchema>;

export const DiscoverRowSchema = v.union([BuiltInRowSchema, FilteredRowSchema]);
export type DiscoverRow = v.InferOutput<typeof DiscoverRowSchema>;

export const DiscoverLayoutSchema = v.pipe(v.array(DiscoverRowSchema), v.maxLength(30));

/**
 * The stored layout, read leniently: a row that no longer fits (a search row
 * from before filtered rows) is dropped instead of breaking Discover.
 */
export const StoredDiscoverLayoutSchema = v.pipe(
  v.array(v.unknown()),
  v.transform((rows) =>
    rows.flatMap((row) => {
      const parsed = v.safeParse(DiscoverRowSchema, row);
      return parsed.success ? [parsed.output] : [];
    }),
  ),
  v.maxLength(30),
);

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
