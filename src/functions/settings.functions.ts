import { createServerFn } from "@tanstack/react-start";
import type * as v from "valibot";

import {
  AudiobookDefaultsSchema,
  MetadataSettingsSchema,
  ServiceConnectionInputSchema,
} from "#/lib/schemas/settings";
import { DEFAULT_AUDIBLE_REGION } from "#/lib/audible-regions";
import { m } from "#/paraglide/messages.js";
import { requireAdmin } from "#/server/auth/middleware";
import { getEnv } from "#/server/env";
import { services } from "#/server/services";
import { settings } from "#/server/settings";
import {
  audiobookDefaults,
  connectionSettings,
  metadataSettings,
} from "#/server/settings/definitions";
import {
  isAudiobookFolder,
  MissingApiKeyError,
  resolveConnection,
  testConnection,
} from "#/server/settings/services";
import { getOrCreateWebhookToken } from "#/server/webhooks/chaptarr";

const globalFetch: typeof fetch = (input, init) => fetch(input, init);

async function connectionSummary(service: keyof typeof connectionSettings) {
  const stored = await settings.get(connectionSettings[service]);
  // Never send the stored key back: only whether one exists.
  return stored ? { url: stored.url, hasApiKey: true } : null;
}

/** Everything the Services settings page shows. Admin only. */
export const getServiceSettings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const [chaptarr, audiobookshelf, metadata, defaults] = await Promise.all([
      connectionSummary("chaptarr"),
      connectionSummary("audiobookshelf"),
      settings.get(metadataSettings),
      settings.get(audiobookDefaults),
    ]);
    return {
      chaptarr,
      audiobookshelf,
      metadata: metadata ?? { audibleRegion: DEFAULT_AUDIBLE_REGION },
      audiobookDefaults: defaults ?? null,
    };
  });

async function resolveOrExplain(input: v.InferOutput<typeof ServiceConnectionInputSchema>) {
  try {
    return await resolveConnection(settings, input.service, input.connection);
  } catch (error) {
    if (error instanceof MissingApiKeyError)
      throw new Error(m.settings_api_key_required(), { cause: error });
    throw error;
  }
}

/** Tests a connection as typed in the form (a blank key uses the stored one). Admin only. */
export const testServiceConnection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(ServiceConnectionInputSchema)
  .handler(async ({ data }) => {
    const connection = await resolveOrExplain(data);
    return testConnection(data.service, connection, globalFetch);
  });

/** Saves a connection (without requiring a passing test). Admin only. */
export const saveServiceConnection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(ServiceConnectionInputSchema)
  .handler(async ({ data }) => {
    const connection = await resolveOrExplain(data);
    await settings.set(connectionSettings[data.service], connection);
    return { ok: true };
  });

export const saveMetadataSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(MetadataSettingsSchema)
  .handler(async ({ data }) => {
    await settings.set(metadataSettings, data);
    return { ok: true };
  });

export const saveAudiobookDefaults = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(AudiobookDefaultsSchema)
  .handler(async ({ data }) => {
    await settings.set(audiobookDefaults, data);
    return { ok: true };
  });

/**
 * Audiobook-compatible root folders and the profiles, live from Chaptarr, for
 * the defaults form and the request modal. Admin only.
 */
export const getChaptarrAudiobookOptions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const chaptarr = await services.chaptarr();
    if (!chaptarr) return { ok: false as const, reason: "not_configured" as const };
    const [folders, quality, metadata] = await Promise.all([
      chaptarr.rootFolders(),
      chaptarr.qualityProfiles(),
      chaptarr.metadataProfiles(),
    ]);
    if (!folders.ok) return { ok: false as const, reason: "error" as const, error: folders.error };
    if (!quality.ok) return { ok: false as const, reason: "error" as const, error: quality.error };
    if (!metadata.ok)
      return { ok: false as const, reason: "error" as const, error: metadata.error };
    return {
      ok: true as const,
      rootFolders: folders.value
        .filter((folder) => isAudiobookFolder(folder.folderType))
        .map((folder) => ({ path: folder.path, name: folder.name ?? folder.path })),
      qualityProfiles: quality.value.map((p) => ({ id: p.id, name: p.name })),
      metadataProfiles: metadata.value.map((p) => ({ id: p.id, name: p.name })),
    };
  });

/** The URL to paste into Chaptarr → Settings → Connect → Webhook. Admin only. */
export const getChaptarrWebhookUrl = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const token = await getOrCreateWebhookToken(settings);
    const url = new URL("/api/webhooks/chaptarr", getEnv().BETTER_AUTH_URL);
    url.searchParams.set("token", token);
    return { url: url.toString() };
  });
