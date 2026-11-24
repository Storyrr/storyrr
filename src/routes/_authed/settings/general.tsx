import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useId } from "react";

import { SettingsRow, SettingsSection } from "#/components/settings/settings-section";
import { Input } from "#/components/ui/input";
import { serviceSettingsQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/settings/general")({
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceSettingsQuery()),
  head: () => ({ meta: [{ title: `${m.settings_tab_general()} · ${m.app_name()}` }] }),
  component: GeneralPage,
});

function GeneralPage() {
  const { data } = useSuspenseQuery(serviceSettingsQuery());
  const urlId = useId();
  return (
    <div className="flex flex-col gap-12">
      <SettingsSection
        title={m.settings_general_title()}
        description={m.settings_general_description()}
      >
        <SettingsRow
          label={m.settings_app_url()}
          description={m.settings_app_url_description()}
          htmlFor={urlId}
        >
          <Input id={urlId} readOnly value={data.appUrl} />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
