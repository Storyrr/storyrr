import "@tanstack/react-start/server-only";

import type { ChaptarrFormat, ConnectionForm, ServiceName } from "#/lib/schemas/settings";
import { createAudiobookshelfClient } from "#/server/services/audiobookshelf/client";
import { createChaptarrClient } from "#/server/services/chaptarr/client";
import { createHardcoverClient } from "#/server/services/hardcover/client";
import { createKavitaClient } from "#/server/services/kavita/client";
import { createKomgaClient } from "#/server/services/komga/client";
import { FOLDER_TYPES } from "#/server/services/chaptarr/schemas";
import type { FetchFn, ServiceError } from "#/server/services/result";

import { connectionSettings } from "./definitions";
import type { SettingsStore } from "./store";

export type ConnectionTest =
  | { ok: true; version?: string; libraries?: number; warnings?: string[] }
  | { ok: false; error: ServiceError };

export class MissingApiKeyError extends Error {
  constructor() {
    super("API key required");
    this.name = "MissingApiKeyError";
  }
}

/** Fills a blank API key from the stored connection (the browser never sees stored keys). */
export async function resolveConnection(
  store: SettingsStore,
  service: ServiceName,
  form: ConnectionForm,
): Promise<{ url: string; apiKey: string }> {
  if (form.apiKey) return { url: form.url, apiKey: form.apiKey };
  const stored = await store.get(connectionSettings[service]);
  if (!stored) throw new MissingApiKeyError();
  return { url: form.url, apiKey: stored.apiKey };
}

export async function testConnection(
  service: ServiceName,
  connection: { url: string; apiKey: string },
  fetch: FetchFn,
): Promise<ConnectionTest> {
  if (service === "chaptarr") {
    const client = createChaptarrClient(connection, fetch);
    const status = await client.status();
    if (!status.ok) return { ok: false, error: status.error };
    // Best effort: Chaptarr's own warnings explain slowness or failing adds.
    const health = await client.health();
    const warnings = health.ok
      ? health.value
          .flatMap((item) => (item.message ? [item.message.slice(0, 200)] : []))
          .slice(0, 3)
      : [];
    return { ok: true, version: status.value.version, warnings };
  }
  if (service === "komga") {
    const libraries = await createKomgaClient(connection, fetch).libraries();
    return libraries.ok
      ? { ok: true, libraries: libraries.value.length }
      : { ok: false, error: libraries.error };
  }
  if (service === "kavita") {
    const libraries = await createKavitaClient(connection, fetch).libraries();
    return libraries.ok
      ? { ok: true, libraries: libraries.value.length }
      : { ok: false, error: libraries.error };
  }
  const libraries = await createAudiobookshelfClient(connection, fetch).libraries();
  return libraries.ok
    ? { ok: true, libraries: libraries.value.length }
    : { ok: false, error: libraries.error };
}

/** Root folders that can receive a format: Mixed (0) folders, plus Audiobook (1) or Ebook (2) ones. */
export function isCompatibleFolder(
  format: ChaptarrFormat,
  folderType: number | undefined,
): boolean {
  if (folderType === undefined || folderType === FOLDER_TYPES.mixed) return true;
  return folderType === (format === "audiobook" ? FOLDER_TYPES.audiobook : FOLDER_TYPES.ebook);
}

/** Checks a Hardcover token with a one-result search. */
export async function testHardcoverToken(token: string, fetch: FetchFn): Promise<ConnectionTest> {
  const result = await createHardcoverClient({ token, fetch }).search("dune", { limit: 1 });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
