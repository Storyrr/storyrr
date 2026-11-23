import "@tanstack/react-start/server-only";
import * as v from "valibot";

/*
 * Chaptarr (Readarr v1 API shape, media-split schema). Shapes come from the
 * Readarr v1 API and Stackarr's chaptarr.py (MIT) and its test fakes; none has
 * been checked against a live Chaptarr yet. Objects are `looseObject` because
 * author payloads are sent back on PUT with unknown fields intact.
 */

// UNVERIFIED: /api/v1/system/status shape (Readarr: { appName, version, … }).
export const SystemStatusSchema = v.looseObject({
  version: v.string(),
  appName: v.optional(v.string()),
});

/** 1 = audiobook, 2 = eBook, 3 = mixed (AGENTS.md › Chaptarr). */
export const FOLDER_TYPES = { audiobook: 1, ebook: 2, mixed: 3 } as const;

const FOLDER_TYPE_NAMES: Record<string, number | undefined> = {
  audiobook: 1,
  audiobooks: 1,
  ebook: 2,
  ebooks: 2,
  mixed: 3,
  both: 3,
};

// UNVERIFIED: field names beyond id/path/name/folderType (per-media defaults are not read yet).
export const RootFolderSchema = v.looseObject({
  id: v.number(),
  path: v.string(),
  name: v.optional(v.nullable(v.string())),
  // UNVERIFIED: documented as 1/2/3; also accept names in case the API sends the enum as a string.
  folderType: v.optional(
    v.pipe(
      v.nullable(v.union([v.number(), v.string()])),
      v.transform((value) =>
        typeof value === "string" ? FOLDER_TYPE_NAMES[value.toLowerCase()] : (value ?? undefined),
      ),
    ),
  ),
  freeSpace: v.optional(v.nullable(v.number())),
});
export type RootFolder = v.InferOutput<typeof RootFolderSchema>;

export const ProfileSchema = v.looseObject({ id: v.number(), name: v.string() });
export type Profile = v.InferOutput<typeof ProfileSchema>;

export const AuthorSchema = v.looseObject({
  id: v.optional(v.number()),
  authorName: v.optional(v.nullable(v.string())),
  foreignAuthorId: v.optional(v.nullable(v.string())),
  monitored: v.optional(v.boolean()),
});
export type Author = v.InferOutput<typeof AuthorSchema>;

// UNVERIFIED: /api/v1/book/lookup?term=az:<ASIN> returns Readarr book resources with an
// embedded `author` (as Readarr's lookup does).
export const BookLookupSchema = v.looseObject({
  title: v.optional(v.nullable(v.string())),
  foreignBookId: v.optional(v.nullable(v.string())),
  author: v.optional(v.nullable(AuthorSchema)),
});

// Rows of /api/v1/book?authorId=: one per media edition (`mediaType`), as in Stackarr's fakes.
export const BookSchema = v.looseObject({
  id: v.number(),
  title: v.optional(v.nullable(v.string())),
  mediaType: v.optional(v.nullable(v.string())),
  asin: v.optional(v.nullable(v.string())),
  audibleASIN: v.optional(v.nullable(v.string())),
  foreignBookId: v.optional(v.nullable(v.string())),
  monitored: v.optional(v.boolean()),
  statistics: v.optional(v.nullable(v.looseObject({ bookFileCount: v.optional(v.number()) }))),
});
export type Book = v.InferOutput<typeof BookSchema>;
