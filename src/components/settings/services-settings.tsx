import { useSuspenseQuery } from "@tanstack/react-query";

import { serviceSettingsQuery } from "#/lib/queries/settings";

import { AudiobookDefaultsCard } from "./audiobook-defaults-card";
import { ConnectionCard } from "./connection-card";
import { MetadataCard } from "./metadata-card";

/** Service connections, metadata region and audiobook defaults (settings page and setup step). */
export function ServicesSettings() {
  const { data } = useSuspenseQuery(serviceSettingsQuery());
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ConnectionCard service="chaptarr" current={data.chaptarr} />
      <ConnectionCard service="audiobookshelf" current={data.audiobookshelf} />
      <MetadataCard current={data.metadata} />
      {/* Remount once Chaptarr is saved so the folder list is fetched again. */}
      <AudiobookDefaultsCard key={data.chaptarr?.url ?? "none"} current={data.audiobookDefaults} />
    </div>
  );
}
