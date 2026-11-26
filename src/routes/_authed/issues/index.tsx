import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import type { Key } from "react-aria-components";
import { toast } from "sonner";
import * as v from "valibot";

import { IssueStatusBadge, issueTypeLabels } from "#/components/issues/issue-labels";
import { Cover } from "#/components/media/cover";
import { Button } from "#/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { formatDate } from "#/lib/format";
import { updateIssueStatus } from "#/functions/issues.functions";
import { can } from "#/lib/permissions";
import { issueKeys, issuesQuery } from "#/lib/queries/issues";
import { m } from "#/paraglide/messages.js";

const FILTERS = ["open", "resolved", "all"] as const;
const filterLabels = {
  open: m.issues_filter_open,
  resolved: m.issues_filter_resolved,
  all: m.issues_filter_all,
};

export const Route = createFileRoute("/_authed/issues/")({
  validateSearch: v.object({ status: v.optional(v.picklist(FILTERS)) }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(issuesQuery(deps.status ?? "open")),
  head: () => ({ meta: [{ title: `${m.issues_title()} · ${m.app_name()}` }] }),
  component: IssuesPage,
});

function IssuesPage() {
  const { status = "open" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: issues } = useSuspenseQuery(issuesQuery(status));
  const { user } = Route.useRouteContext();
  const canManage = can(user, "manage_issues");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold">{m.issues_title()}</h1>
        <p className="text-muted-foreground">{m.issues_description()}</p>
      </div>
      <ToggleGroup
        aria-label={m.issues_filter_label()}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[status]}
        onSelectionChange={(keys: Set<Key>) => {
          const next = FILTERS.find((f) => keys.has(f));
          if (next) void navigate({ search: { status: next === "open" ? undefined : next } });
        }}
        variant="outline"
      >
        {FILTERS.map((f) => (
          <ToggleGroupItem key={f} id={f}>
            {filterLabels[f]()}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {issues.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>{m.issues_empty()}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y">
          {issues.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <Link
                to="/issues/$id"
                params={{ id: item.id }}
                className="flex min-w-0 flex-1 items-center gap-4 py-3 hover:bg-muted/40"
              >
                <Cover src={item.media.coverUrl} type={item.media.type} className="w-14 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{item.media.title}</span>
                    <IssueStatusBadge status={item.status} />
                  </div>
                  <span className="text-sm">{issueTypeLabels[item.type]()}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.issue_reported_by({
                      name: item.reporter.name,
                      date: formatDate(new Date(item.createdAt)),
                    })}{" "}
                    · {m.issue_comments({ count: item.comments })}
                  </span>
                </div>
              </Link>
              {canManage ? <StatusButton id={item.id} status={item.status} /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Resolves (or reopens) an issue from the list, without opening it. Issue managers. */
function StatusButton({ id, status }: { id: string; status: "open" | "resolved" }) {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(updateIssueStatus);
  const next = status === "open" ? "resolved" : "open";
  const setStatus = useMutation({
    mutationFn: () => statusFn({ data: { id, status: next } }),
    onSuccess: () =>
      toast.success(
        next === "resolved"
          ? m.notification_event_issue_resolved()
          : m.notification_event_issue_reopened(),
      ),
    onError: (error) => toast.error(error.message || m.error_generic()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: issueKeys.all }),
  });
  return (
    <Button
      variant={status === "open" ? "default" : "outline"}
      size="sm"
      className="shrink-0"
      isDisabled={setStatus.isPending}
      onPress={() => setStatus.mutate()}
    >
      {status === "open" ? <CheckIcon data-icon="inline-start" /> : null}
      {status === "open" ? m.action_resolve() : m.action_reopen()}
    </Button>
  );
}
