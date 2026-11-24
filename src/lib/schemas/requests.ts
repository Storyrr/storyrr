import * as v from "valibot";

import { SEARCHABLE_TYPES } from "#/lib/media-types";
import { m } from "#/paraglide/messages.js";

export const AsinSchema = v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(/^[A-Z0-9]{10}$/));

/** Hardcover book ids are positive integers. */
export const HardcoverIdSchema = v.pipe(v.string(), v.trim(), v.regex(/^[1-9]\d{0,11}$/));

/** A searchable media item: its type and its id at that type's provider. */
export const MediaRefSchema = v.variant("type", [
  v.object({ type: v.literal("audiobook"), id: AsinSchema }),
  v.object({ type: v.literal("ebook"), id: HardcoverIdSchema }),
]);

export const SearchInputSchema = v.object({
  type: v.picklist(SEARCHABLE_TYPES),
  query: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(200)),
});

/** Admin-only overrides chosen in the request modal or before approving. */
export const TargetOverrideSchema = v.object({
  rootFolderPath: v.optional(v.pipe(v.string(), v.nonEmpty())),
  qualityProfileId: v.optional(v.pipe(v.number(), v.integer())),
});

export const CreateRequestSchema = v.object({
  media: MediaRefSchema,
  ...TargetOverrideSchema.entries,
});

export const RequestIdSchema = v.object({ id: v.pipe(v.string(), v.uuid()) });

export const ApproveRequestSchema = v.object({
  ...RequestIdSchema.entries,
  ...TargetOverrideSchema.entries,
});

/** The deny form: an optional reason shown to the requester. */
export const DenyReasonSchema = v.object({
  reason: v.pipe(
    v.string(),
    v.maxLength(500, () => m.validation_too_long({ max: 500 })),
  ),
});

export const DenyRequestSchema = v.object({
  ...RequestIdSchema.entries,
  reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500))),
});

export const ListRequestsSchema = v.object({
  scope: v.picklist(["mine", "all"]),
  filter: v.picklist(["all", "pending", "processing", "available", "failed"]),
});

export const RemoveFromChaptarrSchema = v.object({
  ...RequestIdSchema.entries,
  deleteFiles: v.boolean(),
});

export const BlockMediaSchema = v.object({
  media: MediaRefSchema,
  reason: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500))),
});

/** The block form: an optional reason, shown on the item's page. */
export const BlockReasonSchema = v.object({
  reason: v.pipe(
    v.string(),
    v.maxLength(500, () => m.validation_too_long({ max: 500 })),
  ),
});

export const BlockIdSchema = v.object({ id: v.pipe(v.string(), v.uuid()) });
