import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { InboxIcon, RefreshCwIcon } from "lucide-react";
import type { Key } from "react-aria-components";
import * as v from "valibot";

import { RequestRow } from "#/components/requests/request-row";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { Spinner } from "#/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { checkAvailabilityNow } from "#/functions/requests.functions";
import { requestKeys, requestsQuery, type RequestFilter } from "#/lib/queries/requests";
import { m } from "#/paraglide/messages.js";

const FILTERS = ["all", "pending", "processing", "available", "failed"] as const;
const filterLabels: Record<RequestFilter, () => string> = {
  all: m.requests_filter_all,
  pending: m.requests_filter_pending,
  processing: m.requests_filter_processing,
  available: m.requests_filter_available,
  failed: m.requests_filter_failed,
};

export const Route = createFileRoute("/_authed/requests")({
  validateSearch: v.object({
    scope: v.optional(v.picklist(["mine", "all"])),
    filter: v.optional(v.picklist(FILTERS)),
  }),
  // Admins see everyone's requests by default (pending first), users their own.
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      requestsQuery(deps.scope ?? (context.user.isAdmin ? "all" : "mine"), deps.filter ?? "all"),
    ),
  head: () => ({ meta: [{ title: `${m.requests_title()} · ${m.app_name()}` }] }),
  component: RequestsPage,
});

const firstKey = (keys: Set<Key>) => [...keys][0];

function RequestsPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const scope = search.scope ?? (user.isAdmin ? "all" : "mine");
  const activeFilter = search.filter ?? "all";
  const { data: requests } = useSuspenseQuery(requestsQuery(scope, activeFilter));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{m.requests_title()}</h1>
        {user.isAdmin ? <CheckNowButton /> : null}
      </div>
      <div className="flex flex-wrap gap-4">
        {user.isAdmin ? (
          <ToggleGroup
            aria-label={m.requests_scope_label()}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[scope]}
            onSelectionChange={(keys) => {
              const key = firstKey(keys);
              if (key === "mine" || key === "all")
                void navigate({ search: { ...search, scope: key } });
            }}
            variant="outline"
          >
            <ToggleGroupItem id="all">{m.requests_scope_all()}</ToggleGroupItem>
            <ToggleGroupItem id="mine">{m.requests_scope_mine()}</ToggleGroupItem>
          </ToggleGroup>
        ) : null}
        <ToggleGroup
          aria-label={m.requests_filter_label()}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[activeFilter]}
          onSelectionChange={(keys) => {
            const filter = FILTERS.find((f) => f === firstKey(keys));
            if (filter) void navigate({ search: { ...search, filter } });
          }}
          variant="outline"
          className="flex-wrap"
        >
          {FILTERS.map((filter) => (
            <ToggleGroupItem key={filter} id={filter}>
              {filterLabels[filter]()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {requests.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyTitle>{m.requests_empty_title()}</EmptyTitle>
            <EmptyDescription>{m.requests_empty_description()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {requests.map((request) => (
            <RequestRow key={request.id} request={request} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CheckNowButton() {
  const queryClient = useQueryClient();
  const checkFn = useServerFn(checkAvailabilityNow);
  const check = useMutation({
    mutationFn: () => checkFn(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: requestKeys.all }),
  });
  return (
    <Button variant="outline" isDisabled={check.isPending} onPress={() => check.mutate()}>
      {check.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <RefreshCwIcon data-icon="inline-start" />
      )}
      {m.action_check_now()}
    </Button>
  );
}
