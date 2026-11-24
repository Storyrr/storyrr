import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCwIcon } from "lucide-react";
import type { Key } from "react-aria-components";
import * as v from "valibot";

import { RequestList } from "#/components/requests/request-list";
import { Button } from "#/components/ui/button";
import { Spinner } from "#/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { checkAvailabilityNow } from "#/functions/requests.functions";
import { requestKeys, requestsQuery } from "#/lib/queries/requests";
import { MEDIA_TYPES, REQUEST_FILTERS, REQUEST_SORTS } from "#/lib/requests";
import { can } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";

const SearchSchema = v.object({
  scope: v.optional(v.picklist(["mine", "all"])),
  filter: v.optional(v.picklist(REQUEST_FILTERS)),
  format: v.optional(v.picklist(MEDIA_TYPES)),
  sort: v.optional(v.picklist(REQUEST_SORTS)),
  order: v.optional(v.picklist(["asc", "desc"])),
});

export const Route = createFileRoute("/_authed/requests")({
  validateSearch: SearchSchema,
  // Those who can see everyone's requests get them by default (pending first), others their own.
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(
      requestsQuery({
        ...deps,
        scope: deps.scope ?? (can(context.user, "view_requests") ? "all" : "mine"),
        filter: deps.filter ?? "all",
      }),
    ),
  head: () => ({ meta: [{ title: `${m.requests_title()} · ${m.app_name()}` }] }),
  component: RequestsPage,
});

const firstKey = (keys: Set<Key> | "all") => (keys === "all" ? undefined : [...keys][0]);

function RequestsPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const params = {
    ...search,
    scope: search.scope ?? (can(user, "view_requests") ? "all" : "mine"),
    filter: search.filter ?? "all",
  } as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{m.requests_title()}</h1>
        {can(user, "manage_requests") ? <CheckNowButton /> : null}
      </div>
      <RequestList
        params={params}
        onChange={(next) => void navigate({ search: { ...search, ...next } })}
        toolbar={
          can(user, "view_requests") ? (
            <ToggleGroup
              aria-label={m.requests_scope_label()}
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[params.scope]}
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
          ) : null
        }
      />
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
