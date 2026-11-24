import { createFileRoute } from "@tanstack/react-router";

import { LibraryServerSettings } from "#/components/settings/library-server";
import { serviceSettingsQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/settings/jellyfin")({
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceSettingsQuery()),
  head: () => ({ meta: [{ title: `${m.service_jellyfin()} · ${m.app_name()}` }] }),
  component: () => <LibraryServerSettings service="jellyfin" />,
});
