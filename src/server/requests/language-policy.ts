import "@tanstack/react-start/server-only";

import { parseAllowedLanguages, type LanguagePolicy } from "#/lib/languages";
import type { ChaptarrFormat } from "#/lib/schemas/settings";
import type { Services } from "#/server/services/factory";
import { formatDefaults } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; policy: LanguagePolicy | null }>();

/**
 * The languages Chaptarr accepts for a format: those of the metadata profile
 * in that format's defaults. Null when unknown (Chaptarr or defaults not set,
 * or Chaptarr unreachable) or when the profile accepts every language: then
 * nothing is filtered or refused.
 */
export async function getLanguagePolicy(
  { services, settings }: { services: Services; settings: SettingsStore },
  format: ChaptarrFormat,
  now = Date.now(),
): Promise<LanguagePolicy | null> {
  const defaults = await settings.get(formatDefaults[format]);
  if (!defaults) return null;
  const key = `${format}:${defaults.metadataProfileId}`;
  const cached = cache.get(key);
  if (cached && now - cached.at < TTL_MS) return cached.policy;

  const chaptarr = await services.chaptarr();
  if (!chaptarr) return null;
  const profiles = await chaptarr.metadataProfiles();
  if (!profiles.ok) return cached?.policy ?? null;
  const profile = profiles.value.find((p) => p.id === defaults.metadataProfileId);
  const policy = parseAllowedLanguages(profile?.allowedLanguages);
  cache.set(key, { at: now, policy });
  return policy;
}

/** Forgets cached policies (after the defaults change). */
export function clearLanguagePolicyCache(): void {
  cache.clear();
}
