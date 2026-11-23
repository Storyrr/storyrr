import { queryOptions } from "@tanstack/react-query";

import { getRequestHistory, getRequests } from "#/functions/requests.functions";
import { IN_FLIGHT_STATUSES } from "#/lib/request-status";

export type RequestScope = "mine" | "all";
export type RequestFilter = "all" | "pending" | "processing" | "available" | "failed";

export const requestKeys = {
  all: ["requests"] as const,
  lists: () => [...requestKeys.all, "list"] as const,
  list: (scope: RequestScope, filter: RequestFilter) =>
    [...requestKeys.lists(), scope, filter] as const,
  history: (id: string) => [...requestKeys.all, "history", id] as const,
};

export const requestsQuery = (scope: RequestScope, filter: RequestFilter) =>
  queryOptions({
    queryKey: requestKeys.list(scope, filter),
    queryFn: () => getRequests({ data: { scope, filter } }),
    // Poll only while something is on its way.
    refetchInterval: (query) =>
      query.state.data?.some((r) => IN_FLIGHT_STATUSES.includes(r.status)) ? 10_000 : false,
  });

export const requestHistoryQuery = (id: string) =>
  queryOptions({
    queryKey: requestKeys.history(id),
    queryFn: () => getRequestHistory({ data: { id } }),
  });
