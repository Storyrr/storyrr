import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";
import { createServices } from "#/server/services/factory";
import { fakeFetch, json } from "#/server/services/test-utils";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { chaptarrConnection } from "#/server/settings/definitions";
import { createSettingsStore } from "#/server/settings/store";

import { clearDownloadsCache, downloadsFor } from "./downloads";

beforeEach(() => clearDownloadsCache());

async function services(records: unknown[]) {
  const settings = createSettingsStore(
    createDatabase(":memory:"),
    deriveSettingsKey("x".repeat(32)),
  );
  await settings.set(chaptarrConnection, { url: "http://chaptarr", apiKey: "k" });
  const fake = fakeFetch((url) =>
    url.pathname === "/api/v1/queue"
      ? json({ totalRecords: records.length, records })
      : json([], 404),
  );
  return { services: createServices(settings, fake.fetch), calls: fake.calls };
}

describe("downloadsFor", () => {
  it("matches queue items by provider ID and media, with progress", async () => {
    const { services: s, calls } = await services([
      {
        bookId: 378,
        book: { foreignBookId: "hc:1901677", mediaType: "ebook" },
        size: 200,
        sizeleft: 50,
        trackedDownloadState: "downloading",
      },
      {
        bookId: 12,
        book: { foreignBookId: "az:B0X", mediaType: "audiobook" },
        size: 0,
        sizeleft: 0,
      },
    ]);
    const downloads = await downloadsFor(s, [
      {
        id: "fr-manga",
        format: "ebook",
        backendRef: { chaptarrForeignBookId: "hc:1901677", chaptarrBookId: 999 },
      },
      { id: "by-local-id", format: "audiobook", backendRef: { chaptarrBookId: 12 } },
      { id: "nothing-grabbed", format: "ebook", backendRef: { chaptarrForeignBookId: "hc:1" } },
    ]);
    expect(downloads.get("fr-manga")).toEqual({ progress: 0.75, state: "downloading" });
    expect(downloads.get("by-local-id")).toEqual({ progress: null, state: null });
    expect(downloads.has("nothing-grabbed")).toBe(false);
    expect(calls[0]?.url.searchParams.get("includeBook")).toBe("true");
  });

  it("doesn't call Chaptarr when nothing was sent", async () => {
    const { services: s, calls } = await services([]);
    expect((await downloadsFor(s, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
