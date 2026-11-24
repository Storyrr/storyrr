import { useSuspenseQuery } from "@tanstack/react-query";

import { serviceSettingsQuery } from "#/lib/queries/settings";

import { ConnectionCard } from "./connection-card";
import { FormatDefaultsCard } from "./format-defaults-card";
import { HardcoverCard } from "./hardcover-card";
import { MetadataCard } from "./metadata-card";
import { PodcastSettingsCard } from "./podcast-settings-card";
import { WebhookCard } from "./webhook-card";

/** Service connections, metadata sources and per-format defaults (settings page and setup step). */
export function ServicesSettings() {
  const { data } = useSuspenseQuery(serviceSettingsQuery());
  // Remount the defaults once Chaptarr changes so the folder lists are fetched again.
  const chaptarrKey = data.chaptarr?.url ?? "none";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ConnectionCard service="chaptarr" current={data.chaptarr} />
      <ConnectionCard service="audiobookshelf" current={data.audiobookshelf} />
      <ConnectionCard service="kavita" current={data.kavita} />
      <HardcoverCard hasToken={data.hardcover.hasToken} />
      <MetadataCard current={data.metadata} />
      <FormatDefaultsCard
        key={`audiobook-${chaptarrKey}`}
        format="audiobook"
        current={data.defaults.audiobook}
      />
      <FormatDefaultsCard
        key={`ebook-${chaptarrKey}`}
        format="ebook"
        current={data.defaults.ebook}
      />
      <PodcastSettingsCard
        key={`podcast-${data.audiobookshelf?.url ?? "none"}`}
        current={data.defaults.podcast}
        policy={data.requestPolicy}
      />
      {data.chaptarr ? <WebhookCard /> : null}
    </div>
  );
}
