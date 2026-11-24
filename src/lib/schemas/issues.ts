import * as v from "valibot";

import { ISSUE_STATUSES, ISSUE_TYPES } from "#/lib/issues";
import { MediaRefSchema } from "#/lib/schemas/requests";
import { m } from "#/paraglide/messages.js";

const MessageSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty(() => m.validation_required()),
  v.maxLength(2000, () => m.validation_too_long({ max: 2000 })),
);

/** The report form (the media comes from the page). */
export const IssueFormSchema = v.object({
  type: v.picklist(ISSUE_TYPES, () => m.validation_required()),
  message: MessageSchema,
});
export const ReportIssueSchema = v.object({ media: MediaRefSchema, ...IssueFormSchema.entries });

export const CommentFormSchema = v.object({ message: MessageSchema });
export const IssueIdSchema = v.object({ id: v.pipe(v.string(), v.uuid()) });
export const CommentIssueSchema = v.object({
  ...IssueIdSchema.entries,
  ...CommentFormSchema.entries,
});
export const SetIssueStatusSchema = v.object({
  ...IssueIdSchema.entries,
  status: v.picklist(ISSUE_STATUSES),
});
export const ListIssuesSchema = v.object({ status: v.optional(v.picklist(ISSUE_STATUSES)) });
