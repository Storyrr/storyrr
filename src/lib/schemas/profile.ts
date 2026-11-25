import * as v from "valibot";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, SetupSchema } from "#/lib/schemas/auth";
import { m } from "#/paraglide/messages.js";
import { locales } from "#/paraglide/runtime.js";

/** "default": follow the browser's language. */
export const LOCALE_CHOICES = ["default", ...locales] as const;
export type LocaleChoice = (typeof LOCALE_CHOICES)[number];

/** Whose account: omitted for the caller's own, a user id for admins editing someone else. */
export const AccountTargetSchema = v.object({
  userId: v.optional(v.pipe(v.string(), v.nonEmpty())),
});

export const ProfileFormSchema = v.object({
  name: SetupSchema.entries.name,
  /** Only admins change it, and only on other accounts. */
  email: SetupSchema.entries.email,
  locale: v.picklist(LOCALE_CHOICES),
});

export const ProfileSchema = v.object({
  ...AccountTargetSchema.entries,
  ...ProfileFormSchema.entries,
});

const newPassword = v.pipe(
  v.string(),
  v.minLength(PASSWORD_MIN_LENGTH, () => m.validation_password_min({ min: PASSWORD_MIN_LENGTH })),
  v.maxLength(PASSWORD_MAX_LENGTH, () => m.validation_too_long({ max: PASSWORD_MAX_LENGTH })),
);

/** Sent to the server: no confirmation field. */
export const ChangePasswordSchema = v.object({
  currentPassword: v.pipe(
    v.string(),
    v.nonEmpty(() => m.validation_required()),
  ),
  newPassword,
});
export type ChangePasswordInput = v.InferOutput<typeof ChangePasswordSchema>;

/** An admin setting another user's password: no current password needed. */
export const SetPasswordSchema = v.object({
  userId: v.pipe(v.string(), v.nonEmpty()),
  newPassword,
});

export const SetPasswordFormSchema = v.pipe(
  v.object({ newPassword, confirmPassword: v.string() }),
  v.forward(
    v.partialCheck(
      [["newPassword"], ["confirmPassword"]],
      (input) => input.newPassword === input.confirmPassword,
      () => m.validation_password_mismatch(),
    ),
    ["confirmPassword"],
  ),
);

/** The form: the new password typed twice. */
export const ChangePasswordFormSchema = v.pipe(
  v.object({ ...ChangePasswordSchema.entries, confirmPassword: v.string() }),
  v.forward(
    v.partialCheck(
      [["newPassword"], ["confirmPassword"]],
      (input) => input.newPassword === input.confirmPassword,
      () => m.validation_password_mismatch(),
    ),
    ["confirmPassword"],
  ),
);

/** "Forgot password?": the account's email. */
export const ForgotPasswordSchema = v.object({ email: SetupSchema.entries.email });

/** The reset page: the new password typed twice. */
export const ResetPasswordFormSchema = SetPasswordFormSchema;
