import * as v from "valibot";

import { m } from "#/paraglide/messages.js";

export const AsinSchema = v.pipe(v.string(), v.trim(), v.toUpperCase(), v.regex(/^[A-Z0-9]{10}$/));

export const SearchInputSchema = v.object({
  query: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(200)),
});

/** Admin-only overrides chosen in the request modal or before approving. */
export const TargetOverrideSchema = v.object({
  rootFolderPath: v.optional(v.pipe(v.string(), v.nonEmpty())),
  qualityProfileId: v.optional(v.pipe(v.number(), v.integer())),
});

export const CreateAudiobookRequestSchema = v.object({
  asin: AsinSchema,
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
