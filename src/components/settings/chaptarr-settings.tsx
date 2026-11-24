import { useSuspenseQuery } from "@tanstack/react-query";

import { serviceSettingsQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

import { ChaptarrServer } from "./chaptarr-server";
import { SettingsSection } from "./settings-section";
import { WebhookRow } from "./webhook-section";

/** Settings → Services: the Chaptarr server card, then its webhook. */
export function ChaptarrSettings() {
  const { data } = useSuspenseQuery(serviceSettingsQuery());
  return (
    <div className="flex flex-col gap-12">
      <SettingsSection
        title={m.settings_chaptarr_title()}
        description={m.settings_chaptarr_description()}
      >
        <ChaptarrServer current={data.chaptarr} defaults={data.defaults} />
      </SettingsSection>
      {data.chaptarr ? (
        <SettingsSection title={m.settings_webhook_title()}>
          <WebhookRow />
        </SettingsSection>
      ) : null}
    </div>
  );
}
