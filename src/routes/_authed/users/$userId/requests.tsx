import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import * as v from "valibot";

import { ProfileHeader } from "#/components/profile/profile-header";
import { RequestList } from "#/components/requests/request-list";
import { can } from "#/lib/permissions";
import { accountQuery } from "#/lib/queries/profile";
import { requestsQuery } from "#/lib/queries/requests";
import { MEDIA_TYPES, REQUEST_FILTERS, REQUEST_SORTS } from "#/lib/requests";
import { m } from "#/paraglide/messages.js";

/** One user's requests (Users → requests count), for those who can view everyone's. */
export const Route = createFileRoute("/_authed/users/$userId/requests")({
  validateSearch: v.object({
    filter: v.optional(v.picklist(REQUEST_FILTERS)),
    format: v.optional(v.picklist(MEDIA_TYPES)),
    sort: v.optional(v.picklist(REQUEST_SORTS)),
    order: v.optional(v.picklist(["asc", "desc"])),
  }),
  beforeLoad: ({ context }) => {
    if (!can(context.user, "view_requests")) throw redirect({ to: "/" });
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(accountQuery(params.userId)),
      context.queryClient.ensureQueryData(
        requestsQuery({
          ...deps,
          scope: "all",
          filter: deps.filter ?? "all",
          userId: params.userId,
        }),
      ),
    ]),
  component: UserRequestsPage,
});

function UserRequestsPage() {
  const { userId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: account } = useSuspenseQuery(accountQuery(userId));
  return (
    <div className="flex flex-col gap-8">
      <ProfileHeader account={account} />
      <h2 className="text-xl font-semibold">{m.users_requests_title({ name: account.name })}</h2>
      <RequestList
        params={{ ...search, scope: "all", filter: search.filter ?? "all", userId }}
        onChange={(next) => void navigate({ search: { ...search, ...next } })}
      />
    </div>
  );
}
