import { queryOptions } from "@tanstack/react-query";

import { getAccount } from "#/functions/profile.functions";

export const profileKeys = {
  all: ["profile"] as const,
  /** `undefined`: the caller's own account. */
  account: (userId?: string) => [...profileKeys.all, "account", userId ?? "me"] as const,
};

export const accountQuery = (userId?: string) =>
  queryOptions({
    queryKey: profileKeys.account(userId),
    queryFn: () => getAccount({ data: { userId } }),
  });
