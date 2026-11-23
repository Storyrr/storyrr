/** Request vocabulary shared by the UI and the server (client-safe). */

export const MEDIA_TYPES = ["audiobook", "ebook", "podcast"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const REQUEST_STATUSES = [
  "pending",
  "approved",
  "submitted",
  "available",
  "denied",
  "failed",
  "cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * Statuses that hold the (media, format, target) slot: a new request for the
 * same slot attaches its requester as a watcher instead of creating a duplicate.
 */
export const ACTIVE_REQUEST_STATUSES = [
  "pending",
  "approved",
  "submitted",
  "available",
  "failed",
] as const satisfies readonly RequestStatus[];

/** Allowed transitions. Every status change goes through `src/server/requests/transitions.ts`. */
export const REQUEST_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  pending: ["approved", "denied", "cancelled"],
  approved: ["submitted", "failed", "cancelled"],
  submitted: ["available", "failed"],
  // Retry: back to approved, then submitted again. Admins can also give up.
  failed: ["approved", "cancelled"],
  available: [],
  denied: [],
  cancelled: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return REQUEST_TRANSITIONS[from].includes(to);
}
