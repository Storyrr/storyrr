import * as v from "valibot";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, SetupSchema } from "#/lib/schemas/auth";
import { RequestLimitsSchema } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** New account: same fields as the first admin, plus a role and auto-approval. */
export const CreateUserSchema = v.object({
  ...SetupSchema.entries,
  password: v.pipe(
    v.string(),
    v.minLength(PASSWORD_MIN_LENGTH, () => m.validation_password_min({ min: PASSWORD_MIN_LENGTH })),
    v.maxLength(PASSWORD_MAX_LENGTH, () => m.validation_too_long({ max: PASSWORD_MAX_LENGTH })),
  ),
  role: v.picklist(USER_ROLES),
  autoApprove: v.boolean(),
});
export type CreateUserInput = v.InferOutput<typeof CreateUserSchema>;

export const UserIdSchema = v.object({ userId: v.pipe(v.string(), v.nonEmpty()) });
export const SetRoleSchema = v.object({ ...UserIdSchema.entries, role: v.picklist(USER_ROLES) });
export const SetAutoApproveSchema = v.object({ ...UserIdSchema.entries, autoApprove: v.boolean() });
export const SetBannedSchema = v.object({ ...UserIdSchema.entries, banned: v.boolean() });
/** A user's own request limits; null goes back to the global ones. */
export const SetRequestLimitsSchema = v.object({
  ...UserIdSchema.entries,
  requestLimits: v.nullable(RequestLimitsSchema),
});
