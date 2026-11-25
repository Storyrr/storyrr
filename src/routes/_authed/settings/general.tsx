import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { AppUrlForm } from "#/components/settings/app-url-form";
import { DiscoverEditor } from "#/components/settings/discover-editor";
import { SettingsSection } from "#/components/settings/settings-section";
import { discoverLayoutQuery } from "#/lib/queries/media";
import { serviceSettingsQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/settings/general")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(serviceSettingsQuery()),
      context.queryClient.ensureQueryData(discoverLayoutQuery()),
    ]),
  head: () => ({ meta: [{ title: `${m.settings_tab_general()} · ${m.app_name()}` }] }),
  component: GeneralPage,
});

function GeneralPage() {
  const { data } = useSuspenseQuery(serviceSettingsQuery());
  return (
    <div className="flex flex-col gap-12">
      <SettingsSection
        title={m.settings_general_title()}
        description={m.settings_general_description()}
      >
        <AppUrlForm value={data.appUrl.value} fromEnv={data.appUrl.fromEnv} />
      </SettingsSection>
      <DiscoverEditor />
    </div>
  );
}
