import { createServerFn } from "@tanstack/react-start";
import type * as v from "valibot";

import {
  DEFAULT_USER_SETTINGS,
  FormatInputSchema,
  HardcoverTokenFormSchema,
  LibraryServiceInputSchema,
  MetadataSettingsSchema,
  SaveFormatDefaultsSchema,
  SaveLibrarySelectionSchema,
  ServiceConnectionInputSchema,
  ServiceInputSchema,
  UserSettingsSchema,
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
  librarySelection,
  metadataSettings,
  userSettings,
} from "#/server/settings/definitions";
import { db } from "#/server/db";
import { libraryStats } from "#/server/library";
import { syncLibrary } from "#/server/library/sync";
import { checkAvailability } from "#/server/requests/availability";
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
    return {
      chaptarr,
      audiobookshelf,
      kavita,
      // Never send the token back: only whether one is stored.
      hardcover: { hasToken: hardcover !== undefined },
      metadata: metadata ?? { audibleRegion: DEFAULT_AUDIBLE_REGION },
      /** Public URL Storyrr is served at (BETTER_AUTH_URL), shown read-only. */
      appUrl: getEnv().BETTER_AUTH_URL,
      defaults: { audiobook: audiobook ?? null, ebook: ebook ?? null },
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

/** Forgets a service connection (its key included). Admin only. */
export const deleteServiceConnection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(ServiceInputSchema)
  .handler(async ({ data }) => {
    await settings.remove(connectionSettings[data.service]);
    if (data.service === "chaptarr") clearLanguagePolicyCache();
    return { ok: true };
  });

/** The media server's libraries, whether each counts for availability, and what's indexed. Admin only. */
export const getLibraries = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(LibraryServiceInputSchema)
  .handler(async ({ data }) => {
    const excluded = new Set((await settings.get(librarySelection[data.service]))?.excluded ?? []);
    const stats = libraryStats(db, data.service);
    let live: { id: string; name: string }[];
    if (data.service === "audiobookshelf") {
      const abs = await services.audiobookshelf();
      if (!abs) return { ok: false as const, reason: "not_configured" as const };
      const result = await abs.libraries();
      if (!result.ok) return { ok: false as const, reason: "error" as const, error: result.error };
      live = result.value
        .filter((library) => library.mediaType === "book")
        .map((library) => ({ id: library.id, name: library.name }));
    } else {
      const kavita = await services.kavita();
      if (!kavita) return { ok: false as const, reason: "not_configured" as const };
      const result = await kavita.libraries();
      if (!result.ok) return { ok: false as const, reason: "error" as const, error: result.error };
      live = result.value.map((library) => ({
        id: String(library.id),
        name: library.name ?? String(library.id),
      }));
    }
    return {
      ok: true as const,
      libraries: live.map((library) => ({
        ...library,
        enabled: !excluded.has(library.id),
        items: stats.counts.get(library.id) ?? 0,
      })),
      lastSyncedAt: stats.lastSyncedAt,
    };
  });

export const saveLibrarySelection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(SaveLibrarySelectionSchema)
  .handler(async ({ data }) => {
    await settings.set(librarySelection[data.service], data.selection);
    return { ok: true };
  });

/** Re-indexes a media server now, then promotes requests whose book arrived. Admin only. */
export const syncLibraryNow = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(LibraryServiceInputSchema)
  .handler(async ({ data }) => {
    const result = await syncLibrary({ db, services, settings }, data.service);
    if (result.ok) await checkAvailability({ db, services });
    return result;
  });

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => (await settings.get(userSettings)) ?? DEFAULT_USER_SETTINGS);

export const saveUserSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(UserSettingsSchema)
  .handler(async ({ data }) => {
    await settings.set(userSettings, data);
    return { ok: true };
  });
