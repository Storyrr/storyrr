import { queryOptions } from "@tanstack/react-query";

import { getAuthState } from "#/functions/auth.functions";

export const authKeys = {
  all: ["auth"] as const,
  state: () => [...authKeys.all, "state"] as const,
};

export const authStateQuery = () =>
  queryOptions({
    queryKey: authKeys.state(),
    queryFn: () => getAuthState(),
    staleTime: 60_000,
  });
