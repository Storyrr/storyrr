import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { describeRequestError } from "#/lib/request-errors";
import { createDatabase, type AppDatabase } from "#/server/db/client";
import { libraryItem, media, request, user } from "#/server/db/schema";
import { createServices } from "#/server/services/factory";
import { fakeChaptarr } from "#/server/services/chaptarr/fake";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { audiobookDefaults, chaptarrConnection } from "#/server/settings/definitions";
import { createSettingsStore, type SettingsStore } from "#/server/settings/store";

import { checkAvailability } from "./availability";
import { submitApproved, submitRequest } from "./submit";
import { createRequest } from "./transitions";

let db: AppDatabase;
let settings: SettingsStore;
let requestId: string;

const noSleep = { sleep: () => Promise.resolve() };

function deps(chaptarr = fakeChaptarr()) {
  return {
    db,
    settings,
    services: createServices(settings, chaptarr.fetch),
    chaptarrOptions: noSleep,
    chaptarr,
  };
}

const statusOf = (id: string) => db.select().from(request).where(eq(request.id, id)).get();

beforeEach(async () => {
  db = createDatabase(":memory:");
  settings = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
  await settings.set(chaptarrConnection, { url: "http://chaptarr:8789", apiKey: "k" });
  await settings.set(audiobookDefaults, {
    rootFolderPath: "/audiobooks",
    qualityProfileId: 1,
    metadataProfileId: 2,
  });
  await db.insert(user).values({ id: "alice", name: "Alice", email: "alice@example.com" });
  const [row] = await db
    .insert(media)
    .values({
      type: "audiobook",
      source: "audible",
      externalId: "B07Q44JYLF",
      title: "Dune",
      fetchedAt: new Date(),
    })
    .returning({ id: media.id });
  requestId = createRequest(db, {
    mediaId: row.id,
    userId: "alice",
    format: "audiobook",
    target: { service: "chaptarr", rootFolderPath: "/audiobooks-fr" },
    autoApprove: true,
  }).requestId;
});

describe("submitRequest", () => {
  it("submits an approved audiobook to Chaptarr into the request's folder", async () => {
    const d = deps();
    expect(await submitRequest(d, requestId)).toBe("submitted");
    expect(statusOf(requestId)).toMatchObject({
      status: "submitted",
      backendRef: { chaptarrAuthorId: 100, chaptarrBookId: 10 },
    });
    const [add] = d.chaptarr.calls("POST", "/api/v1/author");
    expect(add?.init?.body).toContain('"audiobookRootFolderPath":"/audiobooks-fr"');
  });

  it("fails with an explainable reason when Chaptarr isn't configured", async () => {
    await settings.remove(chaptarrConnection);
    expect(await submitRequest(deps(), requestId)).toBe("failed");
    expect(describeRequestError(statusOf(requestId)?.lastError)).toMatch(
      /Chaptarr isn't connected/,
    );
  });

  it("fails with the upstream reason when Chaptarr refuses", async () => {
    const d = deps();
    await settings.set(chaptarrConnection, { url: "http://chaptarr:8789", apiKey: "wrong" });
    const unauthorized = createServices(settings, () =>
      Promise.resolve(new Response("", { status: 401 })),
    );
    expect(await submitRequest({ ...d, services: unauthorized }, requestId)).toBe("failed");
    expect(describeRequestError(statusOf(requestId)?.lastError)).toMatch(/rejected the API key/);
  });

  it("skips requests that aren't approved, and the job submits the approved ones", async () => {
    const d = deps();
    expect(await submitApproved(d)).toBe(1);
    expect(await submitRequest(d, requestId)).toBe("skipped");
    expect(d.chaptarr.calls("POST", "/api/v1/command")).toHaveLength(1);
  });
});

describe("checkAvailability", () => {
  it("marks a submitted request available once Audiobookshelf holds its ASIN", async () => {
    const d = deps();
    await submitRequest(d, requestId);
    expect(await checkAvailability(d)).toEqual([]);

    await db.insert(libraryItem).values({
      backend: "audiobookshelf",
      itemId: "li1",
      libraryId: "lib",
      externalId: "B07Q44JYLF",
      title: "Dune",
      author: "Frank Herbert",
      syncedAt: new Date(),
    });
    expect(await checkAvailability(d)).toEqual([requestId]);
    expect(statusOf(requestId)?.status).toBe("available");
  });

  it("also trusts Chaptarr's imported files", async () => {
    const d = deps();
    await submitRequest(d, requestId);
    const book = d.chaptarr.books[100]?.find((b) => b.id === 10);
    if (book) book.statistics = { bookFileCount: 1 };
    expect(await checkAvailability(d, { actor: "webhook" })).toEqual([requestId]);
  });
});
