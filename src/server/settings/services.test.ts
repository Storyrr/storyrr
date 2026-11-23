import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";
import { fakeFetch, json } from "#/server/services/test-utils";

import { deriveSettingsKey } from "./crypto";
import { chaptarrConnection } from "./definitions";
import {
  isAudiobookFolder,
  MissingApiKeyError,
  resolveConnection,
  testConnection,
} from "./services";
import { createSettingsStore } from "./store";

const store = () =>
  createSettingsStore(createDatabase(":memory:"), deriveSettingsKey("x".repeat(32)));

describe("resolveConnection", () => {
  it("uses the typed key when given", async () => {
    expect(
      await resolveConnection(store(), "chaptarr", { url: "http://c", apiKey: "new" }),
    ).toEqual({
      url: "http://c",
      apiKey: "new",
    });
  });

  it("keeps the stored key when the field is blank", async () => {
    const settings = store();
    await settings.set(chaptarrConnection, { url: "http://old", apiKey: "stored" });
    expect(
      await resolveConnection(settings, "chaptarr", { url: "http://new", apiKey: "" }),
    ).toEqual({
      url: "http://new",
      apiKey: "stored",
    });
  });

  it("requires a key when none is stored", async () => {
    await expect(
      resolveConnection(store(), "audiobookshelf", { url: "http://a", apiKey: "" }),
    ).rejects.toThrow(MissingApiKeyError);
  });
});

describe("testConnection", () => {
  it("reports Chaptarr's version", async () => {
    const { fetch, calls } = fakeFetch((url) =>
      url.pathname === "/api/v1/health"
        ? json([{ type: "warning", message: "Metadata service is unavailable" }])
        : json({ version: "1.2.3" }),
    );
    expect(await testConnection("chaptarr", { url: "http://c", apiKey: "k" }, fetch)).toEqual({
      ok: true,
      version: "1.2.3",
      warnings: ["Metadata service is unavailable"],
    });
    expect(calls[0]?.url.pathname).toBe("/api/v1/system/status");
  });

  it("reports a wrong Audiobookshelf key", async () => {
    const { fetch } = fakeFetch(() => new Response("", { status: 401 }));
    expect(
      await testConnection("audiobookshelf", { url: "http://a", apiKey: "k" }, fetch),
    ).toMatchObject({
      ok: false,
      error: { kind: "auth_failed" },
    });
  });
});

describe("isAudiobookFolder", () => {
  it.each([
    [0, true],
    [1, true],
    [2, false],
    [undefined, true],
  ])("folderType %s → %s", (folderType, expected) => {
    expect(isAudiobookFolder(folderType)).toBe(expected);
  });
});
