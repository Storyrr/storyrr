import { createServerFn } from "@tanstack/react-start";
import type * as v from "valibot";

import {
  FormatInputSchema,
  DEFAULT_REQUEST_POLICY,
  HardcoverTokenFormSchema,
  MetadataSettingsSchema,
  PodcastDefaultsSchema,
  RequestPolicySchema,
  SaveFormatDefaultsSchema,
  ServiceConnectionInputSchema,
} from "#/lib/schemas/settings";
import { DEFAULT_AUDIBLE_REGION } from "#/lib/audible-regions";
import { m } from "#/paraglide/messages.js";
import { requireAdmin } from "#/server/auth/middleware";
import { getEnv } from "#/server/env";
import { services } from "#/server/services";
import type { ServiceError } from "#/server/services/result";
import { settings } from "#/server/settings";
import {
  connectionSettings,
  formatDefaults,
  hardcoverToken,
  metadataSettings,
  podcastDefaults,
  requestPolicy,
} from "#/server/settings/definitions";
import {
  isCompatibleFolder,
  MissingApiKeyError,
  resolveConnection,
  testConnection,
  testHardcoverToken,
} from "#/server/settings/services";
import { clearLanguagePolicyCache } from "#/server/requests/language-policy";
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
    const [chaptarr, audiobookshelf, kavita, hardcover, metadata, audiobook, ebook] =
      await Promise.all([
        connectionSummary("chaptarr"),
        connectionSummary("audiobookshelf"),
        connectionSummary("kavita"),
        settings.get(hardcoverToken),
        settings.get(metadataSettings),
        settings.get(formatDefaults.audiobook),
        settings.get(formatDefaults.ebook),
      ]);
    const [podcast, policy] = await Promise.all([
      settings.get(podcastDefaults),
      settings.get(requestPolicy),
    ]);
    return {
      chaptarr,
      audiobookshelf,
      kavita,
      // Never send the token back: only whether one is stored.
      hardcover: { hasToken: hardcover !== undefined },
      metadata: metadata ?? { audibleRegion: DEFAULT_AUDIBLE_REGION },
      defaults: { audiobook: audiobook ?? null, ebook: ebook ?? null, podcast: podcast ?? null },
      requestPolicy: policy ?? DEFAULT_REQUEST_POLICY,
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

export const saveFormatDefaults = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(SaveFormatDefaultsSchema)
  .handler(async ({ data }) => {
    await settings.set(formatDefaults[data.format], data.defaults);
    clearLanguagePolicyCache();
    return { ok: true };
  });

async function resolveHardcoverToken(typed: string): Promise<string> {
  const token = typed || (await settings.get(hardcoverToken));
  if (!token) throw new Error(m.settings_api_key_required());
  return token;
}

/** Tests the typed Hardcover token (blank: the stored one). Admin only. */
export const testHardcover = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(HardcoverTokenFormSchema)
  .handler(async ({ data }) =>
    testHardcoverToken(await resolveHardcoverToken(data.token), globalFetch),
  );

export const saveHardcover = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(HardcoverTokenFormSchema)
  .handler(async ({ data }) => {
    await settings.set(hardcoverToken, await resolveHardcoverToken(data.token));
    return { ok: true };
  });

/** Logs which Chaptarr call failed (message only: keys never reach logs) and reports it. */
function optionsFailure(endpoint: string, error: ServiceError) {
  console.warn(`[chaptarr] GET /api/v1/${endpoint} failed (${error.kind}): ${error.message}`);
  return { ok: false as const, reason: "error" as const, error };
}

/**
 * The root folders compatible with a format (e.g. Books, Manga and Comics for
 * eBooks) and the profiles, live from Chaptarr, for the defaults form and the
 * request and approve dialogs. Admin only.
 */
export const getChaptarrOptions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(FormatInputSchema)
  .handler(async ({ data }) => {
    const chaptarr = await services.chaptarr();
    if (!chaptarr) return { ok: false as const, reason: "not_configured" as const };
    const [folders, quality, metadata] = await Promise.all([
      chaptarr.rootFolders(),
      chaptarr.qualityProfiles(),
      chaptarr.metadataProfiles(),
    ]);
    if (!folders.ok) return optionsFailure("rootfolder", folders.error);
    if (!quality.ok) return optionsFailure("qualityprofile", quality.error);
    if (!metadata.ok) return optionsFailure("metadataprofile", metadata.error);
    return {
      ok: true as const,
      rootFolders: folders.value
        .filter((folder) => isCompatibleFolder(data.format, folder.folderType))
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

export const savePodcastDefaults = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(PodcastDefaultsSchema)
  .handler(async ({ data }) => {
    await settings.set(podcastDefaults, data);
    return { ok: true };
  });

export const saveRequestPolicy = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(RequestPolicySchema)
  .handler(async ({ data }) => {
    await settings.set(requestPolicy, data);
    return { ok: true };
  });

/** Audiobookshelf's podcast libraries and their folders, live, for defaults and requests. Admin only. */
export const getPodcastLibraryOptions = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const abs = await services.audiobookshelf();
    if (!abs) return { ok: false as const, reason: "not_configured" as const };
    const libraries = await abs.libraries();
    if (!libraries.ok)
      return { ok: false as const, reason: "error" as const, error: libraries.error };
    return {
      ok: true as const,
      libraries: libraries.value
        .filter((library) => library.mediaType === "podcast")
        .map((library) => ({
          id: library.id,
          name: library.name,
          folders: library.folders.map((folder) => ({ id: folder.id, path: folder.fullPath })),
        })),
    };
  });
