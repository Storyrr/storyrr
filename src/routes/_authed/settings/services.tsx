import { createFileRoute, redirect } from "@tanstack/react-router";

import { ServicesSettings } from "#/components/settings/services-settings";
import { serviceSettingsQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/settings/services")({
  beforeLoad: ({ context }) => {
    if (!context.user.isAdmin) throw redirect({ to: "/" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceSettingsQuery()),
  head: () => ({ meta: [{ title: `${m.settings_services_title()} · ${m.app_name()}` }] }),
  component: ServicesPage,
});

function ServicesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{m.settings_services_title()}</h1>
        <p className="text-muted-foreground">{m.settings_services_description()}</p>
      </div>
      <ServicesSettings />
    </div>
  );
}
