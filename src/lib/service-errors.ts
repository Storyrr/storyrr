import type { ServiceName } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";

/** Mirrors the server's ServiceError (client-safe). */
export type ServiceErrorLike = {
  kind: "retryable" | "auth_failed" | "not_found" | "rejected";
  message: string;
};

const serviceNames: Record<ServiceName, () => string> = {
  chaptarr: m.service_chaptarr,
  audiobookshelf: m.service_audiobookshelf,
};

/** A user-facing explanation of a failed call to an external service. */
export function serviceErrorMessage(service: ServiceName, error: ServiceErrorLike): string {
  const name = serviceNames[service]();
  const messages: Record<ServiceErrorLike["kind"], () => string> = {
    auth_failed: () => m.service_error_auth_failed({ service: name }),
    not_found: () => m.service_error_not_found({ service: name }),
    retryable: () => m.service_error_retryable({ service: name, message: error.message }),
    rejected: () => m.service_error_rejected({ service: name, message: error.message }),
  };
  return messages[error.kind]();
}
