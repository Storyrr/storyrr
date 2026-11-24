import "@tanstack/react-start/server-only";

import type { LibraryService } from "#/lib/schemas/settings";
import type { AppDatabase } from "#/server/db/client";
import type { Services } from "#/server/services/factory";
import { fail, ok, type ServiceResult } from "#/server/services/result";
import { librarySelection } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";

import { syncAudiobookshelf, syncJellyfin, syncKavita, syncKomga } from "./index";

export type SyncDeps = { db: AppDatabase; services: Services; settings: SettingsStore };

/** Re-indexes one media server's libraries, minus those the admin turned off. */
export async function syncLibrary(
  { db, services, settings }: SyncDeps,
  service: LibraryService,
): Promise<ServiceResult<{ items: number }>> {
  const excluded = (await settings.get(librarySelection[service]))?.excluded ?? [];
  if (service === "audiobookshelf") {
    const abs = await services.audiobookshelf();
    if (!abs) return fail("not_configured", "Audiobookshelf is not configured");
    return syncAudiobookshelf(db, abs, { excluded });
  }
  if (service === "jellyfin") {
    const jellyfin = await services.jellyfin();
    if (!jellyfin) return fail("not_configured", "Jellyfin is not configured");
    return syncJellyfin(db, jellyfin, { excluded });
  }
  if (service === "komga") {
    const komga = await services.komga();
    if (!komga) return fail("not_configured", "Komga is not configured");
    return syncKomga(db, komga, { excluded });
  }
  const kavita = await services.kavita();
  if (!kavita) return fail("not_configured", "Kavita is not configured");
  const synced = await syncKavita(db, kavita, { excluded });
  return synced.ok ? ok({ items: synced.value.series }) : synced;
}
