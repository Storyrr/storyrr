import * as v from "valibot";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, SetupSchema } from "#/lib/schemas/auth";
import { m } from "#/paraglide/messages.js";
import { locales } from "#/paraglide/runtime.js";

/** "default": follow the browser's language. */
export const LOCALE_CHOICES = ["default", ...locales] as const;
export type LocaleChoice = (typeof LOCALE_CHOICES)[number];

export const ProfileSchema = v.object({
  name: SetupSchema.entries.name,
  locale: v.picklist(LOCALE_CHOICES),
});
export type ProfileInput = v.InferOutput<typeof ProfileSchema>;

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
