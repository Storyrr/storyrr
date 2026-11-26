import { queryOptions } from "@tanstack/react-query";

import {
  getMyQuota,
  getDiscoverRequests,
  getRequestHistory,
  getPendingCount,
  getRequests,
  getTitleDownload,
} from "#/functions/requests.functions";
import type { SearchableType } from "#/lib/media-types";
import { IN_FLIGHT_STATUSES } from "#/lib/request-status";
import type { MediaType, RequestFilter } from "#/lib/requests";
import type { ListRequestsInput } from "#/lib/schemas/requests";

export type RequestScope = "mine" | "all";
export type { RequestFilter } from "#/lib/requests";

/** Everything the request list can be narrowed and sorted by. */
export type RequestListParams = Omit<ListRequestsInput, "scope" | "filter"> & {
  scope: RequestScope;
  filter: RequestFilter;
};

export const requestKeys = {
  all: ["requests"] as const,
  lists: () => [...requestKeys.all, "list"] as const,
  list: (params: RequestListParams) => [...requestKeys.lists(), params] as const,
  pending: () => [...requestKeys.all, "pending-count"] as const,
  history: (id: string) => [...requestKeys.all, "history", id] as const,
  quota: (format: MediaType) => [...requestKeys.all, "quota", format] as const,
};

/** The caller's remaining requests for a format (request dialog). */
export const quotaQuery = (format: MediaType) =>
  queryOptions({
    queryKey: requestKeys.quota(format),
    queryFn: () => getMyQuota({ data: { format } }),
  });

export const requestsQuery = (params: RequestListParams) =>
  queryOptions({
    queryKey: requestKeys.list(params),
    queryFn: () => getRequests({ data: params }),
    // Poll only while something is on its way.
    refetchInterval: (query) =>
      query.state.data?.some((r) => IN_FLIGHT_STATUSES.includes(r.status)) ? 10_000 : false,
  });

export const requestHistoryQuery = (id: string) =>
  queryOptions({
    queryKey: requestKeys.history(id),
    queryFn: () => getRequestHistory({ data: { id } }),
  });

export const discoverRequestsQuery = () =>
  queryOptions({
    queryKey: [...requestKeys.all, "discover"] as const,
    queryFn: () => getDiscoverRequests(),
    // Like the Requests page: follow downloads while something is on its way.
    refetchInterval: (query) =>
      query.state.data?.recentRequests.some((r) => IN_FLIGHT_STATUSES.includes(r.status))
        ? 10_000
        : false,
  });

/** A title's active request and its download, polled while Chaptarr has it. */
export const titleDownloadQuery = (type: SearchableType, id: string) =>
  queryOptions({
    queryKey: [...requestKeys.all, "title-download", type, id] as const,
    queryFn: () => getTitleDownload({ data: { type, id } }),
    refetchInterval: (query) => (query.state.data?.status === "submitted" ? 10_000 : false),
  });

/** Pending requests count for the sidebar badge, refreshed every minute. */
export const pendingCountQuery = () =>
  queryOptions({
    queryKey: requestKeys.pending(),
    queryFn: () => getPendingCount(),
    refetchInterval: 60_000,
  });
