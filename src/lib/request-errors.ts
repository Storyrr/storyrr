import * as v from "valibot";

import type { ServiceName } from "#/lib/schemas/settings";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

/**
 * Why a request failed, stored as JSON in `request.last_error` and the history,
 * so the UI can explain it in the reader's language.
 */
export const RequestErrorSchema = v.variant("code", [
  v.object({
    code: v.literal("service"),
    service: v.picklist(["chaptarr", "audiobookshelf"]),
    kind: v.picklist(["retryable", "auth_failed", "not_found", "rejected"]),
    message: v.string(),
    network: v.optional(v.picklist(["timeout", "unreachable"])),
    timeoutSeconds: v.optional(v.number()),
  }),
  v.object({
    code: v.literal("not_configured"),
    service: v.picklist(["chaptarr", "audiobookshelf"]),
  }),
  v.object({ code: v.literal("defaults_missing") }),
  v.object({ code: v.literal("unsupported") }),
]);
export type RequestError = v.InferOutput<typeof RequestErrorSchema>;

export const encodeRequestError = (error: RequestError) => JSON.stringify(error);

const serviceNames: Record<ServiceName, () => string> = {
  chaptarr: m.service_chaptarr,
  audiobookshelf: m.service_audiobookshelf,
};

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
      return m.request_error_defaults_missing();
    default:
      return m.request_error_unsupported();
  }
}
