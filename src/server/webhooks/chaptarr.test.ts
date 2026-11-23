import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type AppDatabase } from "#/server/db/client";
import { media, request, user } from "#/server/db/schema";
import { createRequest, transitionRequest } from "#/server/requests/transitions";
import { book, fakeChaptarr } from "#/server/services/chaptarr/fake";
import { createServices } from "#/server/services/factory";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { chaptarrConnection } from "#/server/settings/definitions";
import { createSettingsStore, type SettingsStore } from "#/server/settings/store";

import { getOrCreateWebhookToken, handleChaptarrWebhook, isValidWebhookToken } from "./chaptarr";

let db: AppDatabase;
let store: SettingsStore;

beforeEach(async () => {
  db = createDatabase(":memory:");
  store = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
  await store.set(chaptarrConnection, { url: "http://chaptarr", apiKey: "k" });
  await db.insert(user).values({ id: "alice", name: "Alice", email: "alice@example.com" });
});

async function submitted(asin: string, authorId: number, bookId: number) {
  const [row] = await db
    .insert(media)
    .values({
      type: "audiobook",
      source: "audible",
      externalId: asin,
      title: asin,
      fetchedAt: new Date(),
    })
    .returning({ id: media.id });
  const { requestId } = createRequest(db, {
    mediaId: row.id,
    userId: "alice",
    format: "audiobook",
    target: { service: "chaptarr", rootFolderPath: "/a" },
    autoApprove: true,
  });
  transitionRequest(db, requestId, {
    to: "submitted",
    actor: "system",
    backendRef: { chaptarrAuthorId: authorId, chaptarrBookId: bookId },
  });
  return requestId;
}

describe("webhook token", () => {
  it("is created once and compared exactly", async () => {
    const token = await getOrCreateWebhookToken(store);
    expect(await getOrCreateWebhookToken(store)).toBe(token);
    expect(await isValidWebhookToken(store, token)).toBe(true);
    expect(await isValidWebhookToken(store, `${token}x`)).toBe(false);
    expect(await isValidWebhookToken(store, null)).toBe(false);
  });
});

describe("handleChaptarrWebhook", () => {
  it("re-checks the affected request on import and doesn't trust the payload alone", async () => {
    const imported = await submitted("B000000001", 1, 10);
    const other = await submitted("B000000002", 2, 20);
    const chaptarr = fakeChaptarr();
    chaptarr.books[1] = [book(10, "audiobook", "B000000001", 1)];
    chaptarr.books[2] = [book(20, "audiobook", "B000000002", 0)];
    const services = createServices(store, chaptarr.fetch);

    const result = await handleChaptarrWebhook(
      { db, services },
      { eventType: "Download", author: { id: 1 }, books: [{ id: 10 }] },
    );
    expect(result.available).toEqual([imported]);
    expect(db.select().from(request).where(eq(request.id, other)).get()?.status).toBe("submitted");
    // Only the affected author's books were fetched.
    expect(
      chaptarr.calls("GET", "/api/v1/book").map((c) => c.url.searchParams.get("authorId")),
    ).toEqual(["1"]);
  });

  it("ignores events that can't add files", async () => {
    await submitted("B000000001", 1, 10);
    const services = createServices(store, fakeChaptarr().fetch);
    expect(await handleChaptarrWebhook({ db, services }, { eventType: "Grab" })).toEqual({
      checked: false,
      available: [],
    });
  });
});
