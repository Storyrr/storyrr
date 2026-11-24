import { queryOptions } from "@tanstack/react-query";

import { getIssueById, getIssues } from "#/functions/issues.functions";
import type { IssueStatus } from "#/lib/issues";

export const issueKeys = {
  all: ["issues"] as const,
  list: (status: IssueStatus | "all") => [...issueKeys.all, "list", status] as const,
  detail: (id: string) => [...issueKeys.all, "detail", id] as const,
};

export const issuesQuery = (status: IssueStatus | "all") =>
  queryOptions({
    queryKey: issueKeys.list(status),
    queryFn: () => getIssues({ data: { status: status === "all" ? undefined : status } }),
  });

export const issueQuery = (id: string) =>
  queryOptions({ queryKey: issueKeys.detail(id), queryFn: () => getIssueById({ data: { id } }) });
