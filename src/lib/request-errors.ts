import * as v from "valibot";

import { EXTERNAL_SERVICES } from "#/lib/schemas/settings";
import { serviceErrorMessage, serviceNames } from "#/lib/service-errors";
import { formatList } from "#/lib/format";
import { languageName } from "#/lib/languages";
import { m } from "#/paraglide/messages.js";

/**
 * Why a request failed, stored as JSON in `request.last_error` and the history,
 * so the UI can explain it in the reader's language.
 */
export const RequestErrorSchema = v.variant("code", [
  v.object({
    code: v.literal("service"),
    service: v.picklist(EXTERNAL_SERVICES),
    kind: v.picklist(["retryable", "auth_failed", "not_found", "rejected", "not_configured"]),
    message: v.string(),
    network: v.optional(v.picklist(["timeout", "unreachable"])),
    timeoutSeconds: v.optional(v.number()),
  }),
  v.object({
    code: v.literal("not_configured"),
    service: v.picklist(["chaptarr", "audiobookshelf"]),
  }),
  v.object({
    code: v.literal("defaults_missing"),
    format: v.optional(v.picklist(["audiobook", "ebook"]), "audiobook"),
  }),
  v.object({ code: v.literal("unsupported") }),
  /** The Audiobookshelf library folder chosen for a podcast is gone. */
  v.object({ code: v.literal("podcast_folder_missing") }),
  /** Chaptarr's metadata profile filters out every language the work exists in. */
  v.object({ code: v.literal("language_not_accepted"), languages: v.array(v.string()) }),
]);
export type RequestError = v.InferOutput<typeof RequestErrorSchema>;

export const encodeRequestError = (error: RequestError) => JSON.stringify(error);

/** A readable explanation of a stored request error (older free-text values are shown as is). */
export function describeRequestError(stored: string | null | undefined): string | null {
  if (!stored) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return stored;
  }
  const result = v.safeParse(RequestErrorSchema, parsed);
  if (!result.success) return stored;
  const error = result.output;
  switch (error.code) {
    case "service":
      return serviceErrorMessage(error.service, error);
    case "not_configured":
      return m.request_error_not_configured({ service: serviceNames[error.service]() });
    case "defaults_missing":
      return error.format === "ebook"
        ? m.request_error_ebook_defaults_missing()
        : m.request_error_defaults_missing();
    case "podcast_folder_missing":
      return m.request_error_podcast_folder_missing();
    case "language_not_accepted":
      return m.request_language_not_accepted({
        languages: formatList(error.languages.map(languageName)),
      });
    default:
      return m.request_error_unsupported();
  }
}
