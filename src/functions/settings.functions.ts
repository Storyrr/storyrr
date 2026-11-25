import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import * as v from "valibot";

import {
  AppUrlSchema,
  CHAPTARR_FORMATS,
  DEFAULT_USER_SETTINGS,
  FormatInputSchema,
  HardcoverTokenFormSchema,
  RevealSecretSchema,
  LibraryServiceInputSchema,
  type LibraryService,
  NetworkSettingsSchema,
  MetadataSettingsSchema,
  SaveFormatDefaultsSchema,
  SaveLibrarySelectionSchema,
  ServiceConnectionInputSchema,
  ServiceInputSchema,
  UserSettingsFormSchema,
} from "#/lib/schemas/settings";
import { DEFAULT_AUDIBLE_REGION } from "#/lib/audible-regions";
import {
  DEFAULT_MEDIA_SERVER_SIGN_IN,
  MEDIA_SERVERS,
  ServerSignInSchema,
} from "#/lib/media-server-login";
import { m } from "#/paraglide/messages.js";
import { requirePermission } from "#/server/auth/middleware";

const requireSettings = requirePermission("manage_settings");
import { appUrlFromEnv, getAppUrl } from "#/server/app-url";
import { requestOrigin } from "#/server/auth/origins";
import { getEnv } from "#/server/env";
import { services } from "#/server/services";
import { fail, ok, type ServiceError, type ServiceResult } from "#/server/services/result";
import { settings } from "#/server/settings";
import {
  appUrlSetting,
  connectionSettings,
  formatDefaults,
  hardcoverToken,
  librarySelection,
  mediaServerSignIn,
  networkSettings,
  metadataSettings,
  userSettings,
} from "#/server/settings/definitions";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";

import { compareVersions } from "#/lib/version";
import { db } from "#/server/db";
import { listJobs, runJob } from "#/server/jobs";
import { readLogs } from "#/server/logs";
import {
  applyProxy,
  clearImageCache,
  getNetworkSettings,
  imageCacheDir,
  imageCacheStats,
} from "#/server/network";
import { media, request } from "#/server/db/schema";
import { latestReleases, REPOSITORY_URL } from "#/server/releases";
import { APP_VERSION } from "#/server/version";
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

/** Everything the Services settings page shows. Manage settings. */
export const getServiceSettings = createServerFn({ method: "GET" })
  .middleware([requireSettings])
  .handler(async () => {
    const [
      chaptarr,
      audiobookshelf,
      kavita,
      komga,
      jellyfin,
      hardcover,
      metadata,
      audiobook,
      ebook,
    ] = await Promise.all([
      connectionSummary("chaptarr"),
      connectionSummary("audiobookshelf"),
      connectionSummary("kavita"),
      connectionSummary("komga"),
      connectionSummary("jellyfin"),
      settings.get(hardcoverToken),
      settings.get(metadataSettings),
      settings.get(formatDefaults.audiobook),
      settings.get(formatDefaults.ebook),
    ]);
    return {
      chaptarr,
      audiobookshelf,
      kavita,
      komga,
      jellyfin,
      // Never send the token back: only whether one is stored.
      hardcover: { hasToken: hardcover !== undefined },
      metadata: metadata ?? { audibleRegion: DEFAULT_AUDIBLE_REGION },
      /** The application URL; `fromEnv`: set by BETTER_AUTH_URL, read-only here. */
      appUrl: { value: await getAppUrl(settings), fromEnv: appUrlFromEnv() !== null },
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

/** Tests a connection as typed in the form (a blank key uses the stored one). Manage settings. */
export const testServiceConnection = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(ServiceConnectionInputSchema)
  .handler(async ({ data }) => {
    const connection = await resolveOrExplain(data);
    return testConnection(data.service, connection, globalFetch);
  });

/** Saves a connection (without requiring a passing test). Manage settings. */
export const saveServiceConnection = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(ServiceConnectionInputSchema)
  .handler(async ({ data }) => {
    const connection = await resolveOrExplain(data);
    await settings.set(connectionSettings[data.service], connection);
    return { ok: true };
  });

export const saveMetadataSettings = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(MetadataSettingsSchema)
  .handler(async ({ data }) => {
    await settings.set(metadataSettings, data);
    return { ok: true };
  });

export const saveFormatDefaults = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(SaveFormatDefaultsSchema)
  .handler(async ({ data }) => {
    for (const format of CHAPTARR_FORMATS) {
      const defaults = data[format];
      if (defaults) await settings.set(formatDefaults[format], defaults);
    }
    clearLanguagePolicyCache();
    return { ok: true };
  });

async function resolveHardcoverToken(typed: string): Promise<string> {
  const token = typed || (await settings.get(hardcoverToken));
  if (!token) throw new Error(m.settings_api_key_required());
  return token;
}

/** Tests the typed Hardcover token (blank: the stored one). Manage settings. */
export const testHardcover = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(HardcoverTokenFormSchema)
  .handler(async ({ data }) =>
    testHardcoverToken(await resolveHardcoverToken(data.token), globalFetch),
  );

export const saveHardcover = createServerFn({ method: "POST" })
  .middleware([requireSettings])
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
 * request and approve dialogs. Settings, request managers and advanced requesters.
 */
export const getChaptarrOptions = createServerFn({ method: "GET" })
  .middleware([requirePermission("manage_settings", "manage_requests", "request_advanced")])
  .validator(FormatInputSchema)
  .handler(async ({ data }) => {
    const chaptarr = await services.chaptarr();
    if (!chaptarr) return { ok: false as const, reason: "not_configured" as const };
    const [folders, quality, metadata, defaults] = await Promise.all([
      chaptarr.rootFolders(),
      chaptarr.qualityProfiles(),
      chaptarr.metadataProfiles(),
      settings.get(formatDefaults[data.format]),
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
      /** What a request gets when nothing is picked (Settings → Chaptarr). */
      defaults: {
        rootFolderPath: defaults?.rootFolderPath ?? null,
        qualityProfileId: defaults?.qualityProfileId ?? null,
      },
    };
  });

/** Sets the application URL (Settings → General), unless BETTER_AUTH_URL overrides it. */
export const saveAppUrl = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(v.object({ url: AppUrlSchema }))
  .handler(async ({ data }) => {
    if (appUrlFromEnv()) {
      setResponseStatus(409);
      throw new Error(m.settings_app_url_from_env());
    }
    await settings.set(appUrlSetting, data.url);
    return { ok: true };
  });

/** The URL to paste into Chaptarr → Settings → Connect → Webhook. Manage settings. */
export const getChaptarrWebhookUrl = createServerFn({ method: "GET" })
  .middleware([requireSettings])
  .handler(async () => {
    const token = await getOrCreateWebhookToken(settings);
    // Until the application URL is set, the address this page was opened at.
    const base = (await getAppUrl(settings)) ?? requestOrigin(getRequest()) ?? "http://localhost";
    const url = new URL("/api/webhooks/chaptarr", base);
    url.searchParams.set("token", token);
    return { url: url.toString() };
  });

/** Forgets a service connection (its key included). Manage settings. */
export const deleteServiceConnection = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(ServiceInputSchema)
  .handler(async ({ data }) => {
    await settings.remove(connectionSettings[data.service]);
    if (data.service === "chaptarr") clearLanguagePolicyCache();
    return { ok: true };
  });

/** The media server's libraries, whether each counts for availability, and what's indexed. Manage settings. */
export const getLibraries = createServerFn({ method: "GET" })
  .middleware([requireSettings])
  .validator(LibraryServiceInputSchema)
  .handler(async ({ data }) => {
    const excluded = new Set((await settings.get(librarySelection[data.service]))?.excluded ?? []);
    const stats = libraryStats(db, data.service);
    const live = await liveLibraries(data.service);
    if (!live.ok)
      return live.error.kind === "not_configured"
        ? { ok: false as const, reason: "not_configured" as const }
        : { ok: false as const, reason: "error" as const, error: live.error };
    return {
      ok: true as const,
      libraries: live.value.map((library) => ({
        ...library,
        enabled: !excluded.has(library.id),
        items: stats.counts.get(library.id) ?? 0,
      })),
      lastSyncedAt: stats.lastSyncedAt,
    };
  });

/** A media server's libraries that can hold books, as `{ id, name }`. */
async function liveLibraries(
  service: LibraryService,
): Promise<ServiceResult<{ id: string; name: string }[]>> {
  switch (service) {
    case "audiobookshelf": {
      const abs = await services.audiobookshelf();
      if (!abs) return fail("not_configured", "Audiobookshelf is not configured");
      const result = await abs.libraries();
      if (!result.ok) return result;
      return ok(
        result.value
          .filter((library) => library.mediaType === "book")
          .map((library) => ({ id: library.id, name: library.name })),
      );
    }
    case "kavita": {
      const kavita = await services.kavita();
      if (!kavita) return fail("not_configured", "Kavita is not configured");
      const result = await kavita.libraries();
      if (!result.ok) return result;
      return ok(
        result.value.map((library) => ({
          id: String(library.id),
          name: library.name ?? String(library.id),
        })),
      );
    }
    case "jellyfin": {
      const jellyfin = await services.jellyfin();
      if (!jellyfin) return fail("not_configured", "Jellyfin is not configured");
      return jellyfin.libraries();
    }
    default: {
      const komga = await services.komga();
      if (!komga) return fail("not_configured", "Komga is not configured");
      const result = await komga.libraries();
      if (!result.ok) return result;
      return ok(result.value.map((library) => ({ id: library.id, name: library.name })));
    }
  }
}

export const saveLibrarySelection = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(SaveLibrarySelectionSchema)
  .handler(async ({ data }) => {
    await settings.set(librarySelection[data.service], data.selection);
    return { ok: true };
  });

/** Re-indexes a media server now, then promotes requests whose book arrived. Manage settings. */
export const syncLibraryNow = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(LibraryServiceInputSchema)
  .handler(async ({ data }) => {
    const result = await syncLibrary({ db, services, settings }, data.service);
    if (result.ok) await checkAvailability({ db, services });
    return result;
  });

export const getUserSettings = createServerFn({ method: "GET" })
  .middleware([requirePermission("manage_settings", "manage_users")])
  .handler(async () => (await settings.get(userSettings)) ?? DEFAULT_USER_SETTINGS);

export const saveUserSettings = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(UserSettingsFormSchema)
  .handler(async ({ data }) => {
    await settings.set(userSettings, data);
    return { ok: true };
  });

/** Settings → About: version (and whether a newer release exists), totals, runtime info. */
export const getAbout = createServerFn({ method: "GET" })
  .middleware([requireSettings])
  .handler(async () => {
    const releases = await latestReleases(globalFetch);
    const latest = releases.ok ? (releases.value[0] ?? null) : null;
    const count = sql`count(*)`.mapWith(Number);
    const totals = {
      media: db.select({ count }).from(media).get()?.count,
      requests: db.select({ count }).from(request).get()?.count,
    };
    return {
      version: APP_VERSION,
      /** null when GitHub couldn't be reached. */
      updateAvailable: latest ? compareVersions(latest.version, APP_VERSION) > 0 : null,
      releases: releases.ok ? releases.value : [],
      repositoryUrl: REPOSITORY_URL,
      totals: { media: totals.media ?? 0, requests: totals.requests ?? 0 },
      dataDirectory: dirname(resolve(getEnv().DATABASE_URL)),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  });

/** Settings → Metadata "Test": whether Audible and Hardcover answer with the saved settings. */
export const testMetadataProviders = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .handler(async () => {
    const [audible, hardcover] = await Promise.all([
      services.audible().then((client) => client.search("dune")),
      settings
        .get(hardcoverToken)
        .then((token) => (token ? testHardcoverToken(token, globalFetch) : null)),
    ]);
    return {
      audible: audible.ok ? { ok: true as const } : { ok: false as const, error: audible.error },
      hardcover: hardcover,
    };
  });

/**
 * The saved API key or token of a service, for the eye button of its field.
 * The one place a stored secret goes back to the browser: settings managers only, on
 * demand, never logged.
 */
export const revealSecret = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(RevealSecretSchema)
  .handler(async ({ data }) => {
    if (data.service === "hardcover")
      return { secret: (await settings.get(hardcoverToken)) ?? null };
    return { secret: (await settings.get(connectionSettings[data.service]))?.apiKey ?? null };
  });

/** Settings → Jobs: background jobs with their last and next runs. Manage settings. */
export const getJobs = createServerFn({ method: "GET" })
  .middleware([requireSettings])
  .handler(() => listJobs());

/** Starts a job now, in the background (its result shows in the list). Manage settings. */
export const runJobNow = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(v.object({ name: v.picklist(["library-sync", "submit-approved"]) }))
  .handler(({ data }) => {
    void runJob(data.name);
    return { ok: true };
  });

/** Recent server logs, newest first. Manage settings. */
export const getLogs = createServerFn({ method: "GET" })
  .middleware([requireSettings])
  .validator(
    v.object({
      minLevel: v.picklist(["debug", "info", "warn", "error"]),
      search: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
    }),
  )
  .handler(({ data }) => readLogs(data));

/** Sign in with media-server accounts: per server, on and whether new accounts are created. */
export const getMediaServerSignIn = createServerFn({ method: "GET" })
  .middleware([requireSettings])
  .handler(async () => (await settings.get(mediaServerSignIn)) ?? DEFAULT_MEDIA_SERVER_SIGN_IN);

export const saveMediaServerSignIn = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(v.object({ server: v.picklist(MEDIA_SERVERS), value: ServerSignInSchema }))
  .handler(async ({ data }) => {
    const current = (await settings.get(mediaServerSignIn)) ?? DEFAULT_MEDIA_SERVER_SIGN_IN;
    await settings.set(mediaServerSignIn, { ...current, [data.server]: data.value });
    return { ok: true };
  });

/** Settings → Network: proxy, image cache and its size. Manage settings. */
export const getNetwork = createServerFn({ method: "GET" })
  .middleware([requireSettings])
  .handler(async () => ({
    settings: await getNetworkSettings(settings),
    cache: await imageCacheStats(imageCacheDir(getEnv().DATABASE_URL)),
  }));

export const saveNetwork = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(NetworkSettingsSchema)
  .handler(async ({ data }) => {
    await settings.set(networkSettings, data);
    applyProxy(data);
    return { ok: true };
  });

export const clearImages = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .handler(async () => {
    await clearImageCache(imageCacheDir(getEnv().DATABASE_URL));
    return { ok: true };
  });
