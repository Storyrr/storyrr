import { queryOptions } from "@tanstack/react-query";

import type { ChaptarrFormat, LibraryService } from "#/lib/schemas/settings";

import {
  getChaptarrOptions,
  getChaptarrWebhookUrl,
  getLibraries,
  getServiceSettings,
  getUserSettings,
} from "#/functions/settings.functions";

export const settingsKeys = {
  all: ["settings"] as const,
  services: () => [...settingsKeys.all, "services"] as const,
  chaptarrOptions: (format: ChaptarrFormat) =>
    [...settingsKeys.all, "chaptarr", "options", format] as const,
  chaptarrWebhook: () => [...settingsKeys.all, "chaptarr", "webhook"] as const,
  libraries: (service: LibraryService) => [...settingsKeys.all, "libraries", service] as const,
  users: () => [...settingsKeys.all, "users"] as const,
};

export const librariesQuery = (service: LibraryService) =>
  queryOptions({
    queryKey: settingsKeys.libraries(service),
    queryFn: () => getLibraries({ data: { service } }),
  });

export const userSettingsQuery = () =>
  queryOptions({ queryKey: settingsKeys.users(), queryFn: () => getUserSettings() });

export const serviceSettingsQuery = () =>
  queryOptions({ queryKey: settingsKeys.services(), queryFn: () => getServiceSettings() });

export const chaptarrOptionsQuery = (format: ChaptarrFormat) =>
  queryOptions({
    queryKey: settingsKeys.chaptarrOptions(format),
    queryFn: () => getChaptarrOptions({ data: { format } }),
    staleTime: 60_000,
  });

export const chaptarrWebhookQuery = () =>
  queryOptions({
    queryKey: settingsKeys.chaptarrWebhook(),
    queryFn: () => getChaptarrWebhookUrl(),
    staleTime: Infinity,
  });
