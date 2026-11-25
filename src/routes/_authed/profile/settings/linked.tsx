import { createFileRoute } from "@tanstack/react-router";

import { LinkedAccounts } from "#/components/profile/linked-accounts";
import { linkedAccountsQuery } from "#/lib/queries/profile";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/profile/settings/linked")({
  loader: ({ context }) => context.queryClient.ensureQueryData(linkedAccountsQuery()),
  head: () => ({ meta: [{ title: `${m.linked_accounts_title()} · ${m.app_name()}` }] }),
  component: LinkedAccounts,
});
