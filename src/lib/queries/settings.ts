import { queryOptions } from "@tanstack/react-query";

import { getChaptarrAudiobookOptions, getServiceSettings } from "#/functions/settings.functions";

export const settingsKeys = {
  all: ["settings"] as const,
  services: () => [...settingsKeys.all, "services"] as const,
  chaptarrAudiobookOptions: () => [...settingsKeys.all, "chaptarr", "audiobook-options"] as const,
};

export const serviceSettingsQuery = () =>
  queryOptions({ queryKey: settingsKeys.services(), queryFn: () => getServiceSettings() });

export const chaptarrAudiobookOptionsQuery = () =>
  queryOptions({
    queryKey: settingsKeys.chaptarrAudiobookOptions(),
    queryFn: () => getChaptarrAudiobookOptions(),
    staleTime: 60_000,
  });
