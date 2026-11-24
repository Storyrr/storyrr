import { queryOptions } from "@tanstack/react-query";

import { getMyAccount } from "#/functions/profile.functions";

export const profileKeys = {
  all: ["profile"] as const,
  account: () => [...profileKeys.all, "account"] as const,
};

export const accountQuery = () =>
  queryOptions({ queryKey: profileKeys.account(), queryFn: () => getMyAccount() });
