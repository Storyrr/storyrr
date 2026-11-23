import * as v from "valibot";

import { m } from "#/paraglide/messages.js";

/** better-auth's default password bounds. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Messages are functions so they resolve in the locale of the current request.
export const SetupSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(() => m.validation_required()),
    v.maxLength(100, () => m.validation_too_long({ max: 100 })),
  ),
  email: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(() => m.validation_required()),
    v.email(() => m.validation_email()),
  ),
  password: v.pipe(
    v.string(),
    v.minLength(PASSWORD_MIN_LENGTH, () => m.validation_password_min({ min: PASSWORD_MIN_LENGTH })),
    v.maxLength(PASSWORD_MAX_LENGTH, () => m.validation_too_long({ max: PASSWORD_MAX_LENGTH })),
  ),
});

export type SetupInput = v.InferOutput<typeof SetupSchema>;

export const SignInSchema = v.object({
  email: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(() => m.validation_required()),
    v.email(() => m.validation_email()),
  ),
  password: v.pipe(
    v.string(),
    v.nonEmpty(() => m.validation_required()),
  ),
});

export type SignInInput = v.InferOutput<typeof SignInSchema>;
