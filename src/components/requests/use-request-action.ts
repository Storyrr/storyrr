import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { getRequests } from "#/functions/requests.functions";
import { mediaKeys } from "#/lib/queries/media";
import { requestKeys } from "#/lib/queries/requests";
import type { RequestStatus } from "#/lib/requests";

type RequestListItem = Awaited<ReturnType<typeof getRequests>>[number];

/**
 * A request status change with an optimistic update of every cached list,
 * rolled back if the server refuses, then refetched.
 */
export function useRequestAction<TVars extends { id: string }>(
  action: (vars: TVars) => Promise<unknown>,
  optimisticStatus: RequestStatus,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: requestKeys.lists() });
      const previous = queryClient.getQueriesData<RequestListItem[]>({
        queryKey: requestKeys.lists(),
      });
      queryClient.setQueriesData<RequestListItem[]>({ queryKey: requestKeys.lists() }, (rows) =>
        rows?.map((row) => (row.id === vars.id ? { ...row, status: optimisticStatus } : row)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [key, rows] of context?.previous ?? []) queryClient.setQueryData(key, rows);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: requestKeys.all }),
        queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
      ]),
  });
}
