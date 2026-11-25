import * as v from "valibot";

import { m } from "#/paraglide/messages.js";

/** Media servers whose accounts can sign in to Storyrr (decided 2026-11-24). */
export const MEDIA_SERVERS = ["audiobookshelf", "kavita", "komga", "jellyfin"] as const;
export type MediaServer = (typeof MEDIA_SERVERS)[number];

/** Per server: sign-in on, and whether unknown accounts get a Storyrr account. */
export const ServerSignInSchema = v.object({ enabled: v.boolean(), allowNew: v.boolean() });
const OFF = { enabled: false, allowNew: false };
/** Sign-in settings of every server; servers added later start off. */
export const MediaServerSignInSettingsSchema = v.object({
  audiobookshelf: v.optional(ServerSignInSchema, OFF),
  kavita: v.optional(ServerSignInSchema, OFF),
  komga: v.optional(ServerSignInSchema, OFF),
  jellyfin: v.optional(ServerSignInSchema, OFF),
});
export type MediaServerSignInSettings = v.InferOutput<typeof MediaServerSignInSettingsSchema>;
export const DEFAULT_MEDIA_SERVER_SIGN_IN: MediaServerSignInSettings = {
  audiobookshelf: OFF,
  kavita: OFF,
  komga: OFF,
  jellyfin: OFF,
};

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
  /** A new account would take the email of an existing one: sign in with that one, then link. */
  "email_in_use",
  /** Linking: the media-server account is already another Storyrr user's. */
  "linked_elsewhere",
] as const;
export type MediaServerSignInError = (typeof MEDIA_SERVER_SIGN_IN_ERRORS)[number];

/** Linking or unlinking one's own media-server account (profile settings). */
export const UnlinkMediaServerSchema = v.object({ server: v.picklist(MEDIA_SERVERS) });

/** Display names of the media servers. */
export const MEDIA_SERVER_NAMES: Record<MediaServer, () => string> = {
  audiobookshelf: m.service_audiobookshelf,
  kavita: m.service_kavita,
  komga: m.service_komga,
  jellyfin: m.service_jellyfin,
};

const ERROR_MESSAGES: Record<MediaServerSignInError, () => string> = {
  disabled: m.sign_in_error_disabled,
  invalid: m.sign_in_error_invalid,
  no_account: m.sign_in_error_no_account,
  unreachable: m.sign_in_error_unreachable,
  email_in_use: m.sign_in_error_email_in_use,
  linked_elsewhere: m.sign_in_error_linked_elsewhere,
};

/** What to tell the user for a refusal code (any case; unknown codes: the generic error). */
export function mediaServerErrorMessage(code: string | undefined): string {
  const known = MEDIA_SERVER_SIGN_IN_ERRORS.find((error) => error === code?.toLowerCase());
  return (known ? ERROR_MESSAGES[known] : m.error_generic)();
}
