import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";
import { createServices } from "#/server/services/factory";
import { fakeFetch, json } from "#/server/services/test-utils";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { chaptarrConnection, ebookDefaults } from "#/server/settings/definitions";
import { createSettingsStore } from "#/server/settings/store";

import { clearLanguagePolicyCache, getLanguagePolicy } from "./language-policy";

const profiles = [
  { id: 1, name: "Audiobook Default", allowedLanguages: "eng" },
  { id: 2, name: "Ebook Default", allowedLanguages: "fre,fra" },
  { id: 3, name: "Anything", allowedLanguages: "" },
];

beforeEach(() => clearLanguagePolicyCache());

async function setup(metadataProfileId = 2) {
  const settings = createSettingsStore(
    createDatabase(":memory:"),
    deriveSettingsKey("x".repeat(32)),
  );
  await settings.set(chaptarrConnection, { url: "http://chaptarr", apiKey: "k" });
  await settings.set(ebookDefaults, {
    rootFolderPath: "/manga",
    qualityProfileId: 1,
    metadataProfileId,
  });
  const chaptarr = fakeFetch(() => json(profiles));
  return { settings, services: createServices(settings, chaptarr.fetch), calls: chaptarr.calls };
}

describe("getLanguagePolicy", () => {
  it("reads the metadata profile of the format's defaults, and caches it", async () => {
    const deps = await setup();
    expect(await getLanguagePolicy(deps, "ebook", 0)).toEqual({
      allowed: ["fra"],
      allowUnknown: false,
    });
    await getLanguagePolicy(deps, "ebook", 60_000);
    expect(deps.calls).toHaveLength(1);
    await getLanguagePolicy(deps, "ebook", 10 * 60_000);
    expect(deps.calls).toHaveLength(2);
  });

  it("doesn't filter when the profile accepts every language or no defaults are set", async () => {
    expect(await getLanguagePolicy(await setup(3), "ebook")).toBeNull();
    expect(await getLanguagePolicy(await setup(), "audiobook")).toBeNull();
  });
});
