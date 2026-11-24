import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Agent, EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

import { DEFAULT_NETWORK_SETTINGS, type NetworkSettings } from "#/lib/schemas/settings";
import { networkSettings } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";

export async function getNetworkSettings(settings: SettingsStore): Promise<NetworkSettings> {
  return (await settings.get(networkSettings)) ?? DEFAULT_NETWORK_SETTINGS;
}

/**
 * Routes Storyrr's outbound HTTP calls (Node's fetch) through the configured
 * proxy, except hosts in the bypass list; or directly when none is set.
 */
export function applyProxy({ proxyUrl, noProxy }: NetworkSettings): void {
  setGlobalDispatcher(
    proxyUrl
      ? new EnvHttpProxyAgent({ httpProxy: proxyUrl, httpsProxy: proxyUrl, noProxy })
      : new Agent(),
  );
}

/** Where covers can come from: the metadata providers' image hosts only (no open proxy). */
export const IMAGE_HOSTS = [
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
  "assets.hardcover.app",
];

export function isAllowedImageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && IMAGE_HOSTS.includes(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** The image cache folder, next to the database (the data volume). */
export const imageCacheDir = (databaseUrl: string) =>
  join(dirname(resolve(databaseUrl.replace(/^file:/, ""))), "cache", "images");

/**
 * A cover from the cache, fetched and stored when missing or older than 30
 * days. Null when the upstream answer isn't an image (or too big).
 */
export async function cachedImage(
  dir: string,
  url: URL,
  fetch: typeof globalThis.fetch,
): Promise<{ body: Buffer; type: string } | null> {
  const name = createHash("sha256").update(url.href).digest("hex");
  const file = join(dir, name);
  try {
    const info = await stat(file);
    if (Date.now() - info.mtimeMs < MAX_AGE_MS) {
      const type = await readFile(`${file}.type`, "utf8");
      return { body: await readFile(file), type };
    }
  } catch {
    // Not cached yet.
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/")) return null;
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_BYTES) return null;
  await mkdir(dir, { recursive: true });
  await writeFile(file, body);
  await writeFile(`${file}.type`, type);
  return { body, type };
}

/** Number of cached covers and their total size. */
export async function imageCacheStats(dir: string): Promise<{ files: number; bytes: number }> {
  try {
    const names = (await readdir(dir)).filter((n) => !n.endsWith(".type"));
    let bytes = 0;
    for (const name of names) bytes += (await stat(join(dir, name))).size;
    return { files: names.length, bytes };
  } catch {
    return { files: 0, bytes: 0 };
  }
}

export async function clearImageCache(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
