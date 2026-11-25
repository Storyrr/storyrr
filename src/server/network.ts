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

/**
 * The cover URL to fetch, or null when it isn't one: HTTPS on a provider's
 * image host, default port, no credentials. The query and fragment are dropped
 * (covers don't use them), so they can't be used to fill the cache.
 */
export function isAllowedImageUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return null;
    if (!IMAGE_HOSTS.includes(url.hostname)) return null;
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

/**
 * Image types served from the cache. SVG is left out: served from Storyrr's
 * origin, its scripts would run there.
 */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REDIRECTS = 3;
/** Past this, covers are still served but no longer stored (until the cache is cleared). */
export const MAX_CACHE_BYTES = 1024 * 1024 * 1024;

/** The image cache folder, next to the database (the data volume). */
export const imageCacheDir = (databaseUrl: string) =>
  join(dirname(resolve(databaseUrl.replace(/^file:/, ""))), "cache", "images");

/** Bytes stored per cache folder, counted once from disk then kept up to date. */
const cacheSizes = new Map<string, number>();

async function cacheSize(dir: string): Promise<number> {
  const known = cacheSizes.get(dir);
  if (known !== undefined) return known;
  const { bytes } = await imageCacheStats(dir);
  cacheSizes.set(dir, bytes);
  return bytes;
}

/** Follows redirects only to other allowed image URLs. */
async function fetchImage(url: URL, fetch: typeof globalThis.fetch): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const next = isAllowedImageUrl(new URL(response.headers.get("location") ?? "", current).href);
    await response.body?.cancel();
    if (!next) return null;
    current = next;
  }
  return null;
}

/** The body, or null past `max` bytes (stops reading there). */
async function readCapped(response: Response, max: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > max) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}

/**
 * A cover from the cache, fetched and stored when missing or older than 30
 * days. Null when the upstream answer isn't a raster image (or too big).
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
      if (IMAGE_TYPES.has(type)) return { body: await readFile(file), type };
    }
  } catch {
    // Not cached yet.
  }
  const response = await fetchImage(url, fetch);
  if (!response) return null;
  const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (!response.ok || !type || !IMAGE_TYPES.has(type)) {
    await response.body?.cancel();
    return null;
  }
  const body = await readCapped(response, MAX_BYTES);
  if (!body) return null;
  const stored = await cacheSize(dir);
  if (stored + body.length <= MAX_CACHE_BYTES) {
    await mkdir(dir, { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.type`, type);
    cacheSizes.set(dir, stored + body.length);
  }
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
  cacheSizes.delete(dir);
}
