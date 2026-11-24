import * as v from "valibot";

import { m } from "#/paraglide/messages.js";

/** Media servers whose accounts can sign in to Storyrr (decided 2026-11-24). */
export const MEDIA_SERVERS = ["audiobookshelf", "kavita"] as const;
export type MediaServer = (typeof MEDIA_SERVERS)[number];

export const MediaServerSignInSchema = v.object({
  server: v.picklist(MEDIA_SERVERS),
  username: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(() => m.validation_required()),
    v.maxLength(200),
  ),
  password: v.pipe(
    v.string(),
    v.nonEmpty(() => m.validation_required()),
    v.maxLength(500),
  ),
});
export type MediaServerSignInInput = v.InferOutput<typeof MediaServerSignInSchema>;

/** Why a media-server sign-in was refused (codes the sign-in page explains). */
export const MEDIA_SERVER_SIGN_IN_ERRORS = [
  "disabled",
  "invalid",
  "no_account",
  "unreachable",
] as const;
export type MediaServerSignInError = (typeof MEDIA_SERVER_SIGN_IN_ERRORS)[number];
