import "@tanstack/react-start/server-only";
import * as v from "valibot";

/*
 * Chaptarr's native /api/v1, checked against its source (Chaptarr/chaptarr,
 * commit 42a0e0b) and docs/API_IDENTITY_AND_LIFECYCLE.md. JSON is camelCase,
 * enums are camelCase strings. Objects are `looseObject`: Chaptarr sends far
 * more fields than Storyrr reads.
 */

export const SystemStatusSchema = v.looseObject({
  version: v.string(),
  appName: v.optional(v.string()),
});

// GET /api/v1/health: [{ type, message }].
export const HealthItemSchema = v.looseObject({
  type: v.optional(v.string()),
  message: v.optional(v.string()),
});

/** RootFolder.FolderType: Mixed = 0, Audiobook = 1, Ebook = 2. */
export const FOLDER_TYPES = { mixed: 0, audiobook: 1, ebook: 2 } as const;

export const RootFolderSchema = v.looseObject({
  id: v.number(),
  path: v.string(),
  name: v.optional(v.nullable(v.string())),
  folderType: v.optional(v.number()),
  freeSpace: v.optional(v.nullable(v.number())),
});
export type RootFolder = v.InferOutput<typeof RootFolderSchema>;

export const ProfileSchema = v.looseObject({
  id: v.number(),
  name: v.string(),
  /** Metadata profiles only: "fre,fra,null"-style ISO 639-2 codes; empty means any language. */
  allowedLanguages: v.optional(v.nullable(v.string())),
});
export type Profile = v.InferOutput<typeof ProfileSchema>;

/**
 * A BookResource as returned by `GET /book/lookup`: local copies (id > 0, with
 * statistics) when Chaptarr has the book, otherwise remote results (id 0).
 * Provider IDs are prefixed (`az:`, `hc:`…) and are the durable identity.
 */
export const BookSchema = v.looseObject({
  id: v.optional(v.number(), 0),
  title: v.optional(v.nullable(v.string())),
  foreignBookId: v.optional(v.nullable(v.string())),
  /** "audiobook" | "ebook". */
  mediaType: v.optional(v.nullable(v.string())),
  monitored: v.optional(v.boolean()),
  hasFiles: v.optional(v.boolean()),
  statistics: v.optional(v.nullable(v.looseObject({ bookFileCount: v.optional(v.number()) }))),
  author: v.optional(
    v.nullable(
      v.looseObject({
        foreignAuthorId: v.optional(v.nullable(v.string())),
        authorName: v.optional(v.nullable(v.string())),
      }),
    ),
  ),
});
export type Book = v.InferOutput<typeof BookSchema>;

/**
 * `POST /book/import`: 201 `{ id }` once the book exists, or 202
 * `{ pendingId, message }` while Chaptarr waits for the author's metadata (it
 * then runs the requested search by itself).
 */
export const BookImportResponseSchema = v.looseObject({
  id: v.optional(v.number()),
  pendingId: v.optional(v.number()),
  message: v.optional(v.nullable(v.string())),
});
