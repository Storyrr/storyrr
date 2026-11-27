import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { FetchFn, ServiceResult } from "#/server/services/result";
import { ok, requestJson } from "#/server/services/result";

/** Public GitHub repository the releases come from (release-please tags them vX.Y.Z). */
export const REPOSITORY_URL = "https://github.com/Storyrr/storyrr";
/** The website and its documentation (the `Storyrr/storyrr.github.io` repository). */
export const DOCUMENTATION_URL = "https://storyrr.github.io";
const RELEASES_API = "https://api.github.com/repos/Storyrr/storyrr/releases?per_page=20";

const ReleasesSchema = v.array(
  v.looseObject({
    tag_name: v.string(),
    name: v.nullable(v.string()),
    html_url: v.string(),
    published_at: v.nullable(v.string()),
    body: v.optional(v.nullable(v.string())),
    draft: v.optional(v.boolean(), false),
    prerelease: v.optional(v.boolean(), false),
  }),
);

export type Release = {
  version: string;
  url: string;
  publishedAt: string | null;
  /** The release notes, in Markdown (shown in Settings → About). */
  notes: string;
};

/** Enough for any changelog; a longer body is cut rather than sent whole to every admin page. */
const MAX_NOTES_LENGTH = 40_000;

const TTL_MS = 60 * 60_000;
let cache: { at: number; releases: Release[] } | undefined;

/** The latest published releases, newest first, cached for an hour. */
export async function latestReleases(fetch: FetchFn): Promise<ServiceResult<Release[]>> {
  if (cache && Date.now() - cache.at < TTL_MS) return ok(cache.releases);
  const result = await requestJson({
    fetch,
    service: "GitHub",
    url: new URL(RELEASES_API),
    schema: ReleasesSchema,
    // Generic client name: nothing about this instance is sent.
    init: { headers: { Accept: "application/vnd.github+json", "User-Agent": "Storyrr" } },
    timeoutMs: 10_000,
  });
  if (!result.ok) return result;
  const releases = result.value
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({
      version: release.tag_name.replace(/^v/, ""),
      url: release.html_url,
      publishedAt: release.published_at,
      notes: (release.body ?? "").slice(0, MAX_NOTES_LENGTH),
    }));
  cache = { at: Date.now(), releases };
  return ok(releases);
}
