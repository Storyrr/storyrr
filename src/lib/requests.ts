/** Request vocabulary shared by the UI and the server (client-safe). */

export const MEDIA_TYPES = ["audiobook", "ebook"] as const;
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
  // Admins can give up on a request Chaptarr never fulfils (cleanup in Chaptarr stays manual).
  submitted: ["available", "failed", "cancelled"],
  // Retry: back to approved, then submitted again. Admins can also give up.
  failed: ["approved", "cancelled"],
  available: [],
  denied: [],
  cancelled: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return REQUEST_TRANSITIONS[from].includes(to);
}

/** What a user may still request of one format; `remaining: null` is unlimited. */
export type RequestQuota = {
  limit: number | null;
  days: number;
  used: number;
  remaining: number | null;
};

/** Request list filters (Requests page). */
export const REQUEST_FILTERS = [
  "all",
  "pending",
  "processing",
  "available",
  "declined",
  "failed",
  "cancelled",
] as const;
export type RequestFilter = (typeof REQUEST_FILTERS)[number];

/** "status": pending first, then newest (the default); the others by date. */
export const REQUEST_SORTS = ["status", "added", "modified"] as const;
export type RequestSort = (typeof REQUEST_SORTS)[number];
