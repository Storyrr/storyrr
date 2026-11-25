import "@tanstack/react-start/server-only";

import { getEnv } from "./env";
import { appUrlSetting } from "./settings/definitions";
import type { SettingsStore } from "./settings/store";

/** BETTER_AUTH_URL as an origin, when set: it overrides the stored URL. */
export function appUrlFromEnv(): string | null {
  const url = getEnv().BETTER_AUTH_URL;
  return url ? new URL(url).origin : null;
}

/**
 * The application URL (an origin, no trailing slash): where links in emails,
 * notifications and the Chaptarr webhook point. Null until the setup wizard or
 * Settings → General sets it.
 */
export async function getAppUrl(settings: SettingsStore): Promise<string | null> {
  return appUrlFromEnv() ?? (await settings.get(appUrlSetting)) ?? null;
}
