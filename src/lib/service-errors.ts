import type { ExternalService } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";

/** Mirrors the server's ServiceError (client-safe). */
export type ServiceErrorLike = {
  kind: "retryable" | "auth_failed" | "not_found" | "rejected" | "not_configured";
  message: string;
  network?: "timeout" | "unreachable";
  timeoutSeconds?: number;
};

export const serviceNames: Record<ExternalService, () => string> = {
  chaptarr: m.service_chaptarr,
  audiobookshelf: m.service_audiobookshelf,
  kavita: m.service_kavita,
  komga: m.service_komga,
  hardcover: m.service_hardcover,
  audible: m.service_audible,
};

/** A user-facing explanation of a failed call to an external service. */
export function serviceErrorMessage(service: ExternalService, error: ServiceErrorLike): string {
  const name = serviceNames[service]();
  const messages: Record<ServiceErrorLike["kind"], () => string> = {
    auth_failed: () => m.service_error_auth_failed({ service: name }),
    not_found: () => m.service_error_not_found({ service: name }),
    retryable: () => {
      if (error.network === "timeout") {
        return m.service_error_timeout({ service: name, seconds: error.timeoutSeconds ?? 0 });
      }
      if (error.network === "unreachable") return m.service_error_unreachable({ service: name });
      return m.service_error_retryable({ service: name, message: error.message });
    },
    rejected: () => m.service_error_rejected({ service: name, message: error.message }),
    not_configured: () => m.request_error_not_configured({ service: name }),
  };
  return messages[error.kind]();
}

/** Why Chaptarr's folders and profiles couldn't be listed (not connected, or the call failed). */
export function chaptarrOptionsErrorMessage(
  failure: { reason: "not_configured" } | { reason: "error"; error: ServiceErrorLike },
): string {
  return failure.reason === "not_configured"
    ? m.settings_audiobook_defaults_needs_chaptarr()
    : serviceErrorMessage("chaptarr", failure.error);
}
