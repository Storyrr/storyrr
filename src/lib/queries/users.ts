import { queryOptions } from "@tanstack/react-query";

import { getUsers } from "#/functions/users.functions";

export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
};

export const usersQuery = () =>
  queryOptions({ queryKey: userKeys.list(), queryFn: () => getUsers() });
