import { queryOptions } from "@tanstack/react-query";

import {
  getChaptarrAudiobookOptions,
  getChaptarrWebhookUrl,
  getServiceSettings,
} from "#/functions/settings.functions";

export const settingsKeys = {
  all: ["settings"] as const,
  services: () => [...settingsKeys.all, "services"] as const,
  chaptarrAudiobookOptions: () => [...settingsKeys.all, "chaptarr", "audiobook-options"] as const,
  chaptarrWebhook: () => [...settingsKeys.all, "chaptarr", "webhook"] as const,
};

export const serviceSettingsQuery = () =>
  queryOptions({ queryKey: settingsKeys.services(), queryFn: () => getServiceSettings() });

export const chaptarrAudiobookOptionsQuery = () =>
  queryOptions({
    queryKey: settingsKeys.chaptarrAudiobookOptions(),
    queryFn: () => getChaptarrAudiobookOptions(),
    staleTime: 60_000,
  });

export const chaptarrWebhookQuery = () =>
  queryOptions({
    queryKey: settingsKeys.chaptarrWebhook(),
    queryFn: () => getChaptarrWebhookUrl(),
    staleTime: Infinity,
  });
