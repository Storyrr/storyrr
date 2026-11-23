import type { RequestStatus } from "#/lib/requests";

/** What a search card or detail page shows for an item. */
export type MediaAvailability = "available" | "requested" | "processing" | "none";

export function availabilityFromRequest(status: RequestStatus | undefined): MediaAvailability {
  switch (status) {
    case "available":
      return "available";
    case "pending":
      return "requested";
    case "approved":
    case "submitted":
    case "failed":
      return "processing";
    default:
      return "none";
  }
}

/** Statuses during which the requests list keeps polling. */
export const IN_FLIGHT_STATUSES: readonly RequestStatus[] = ["approved", "submitted"];
