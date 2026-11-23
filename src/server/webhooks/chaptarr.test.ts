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

async function submitted(asin: string, bookId: number) {
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
    backendRef: { chaptarrBookId: bookId, chaptarrForeignBookId: `az:${asin}` },
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
  it("re-checks only the affected request on import, asking Chaptarr rather than trusting the payload", async () => {
    const imported = await submitted("B000000001", 10);
    const other = await submitted("B000000002", 20);
    const chaptarr = fakeChaptarr({ lookup: [book(10, "audiobook", 1)] });
    const services = createServices(store, chaptarr.fetch);

    // Chaptarr sends camelCase event types.
    const result = await handleChaptarrWebhook(
      { db, services },
      { eventType: "download", book: { id: 10 } },
    );
    expect(result.available).toEqual([imported]);
    expect(db.select().from(request).where(eq(request.id, other)).get()?.status).toBe("submitted");
    expect(
      chaptarr.calls("GET", "/api/v1/book/lookup").map((c) => c.url.searchParams.get("term")),
    ).toEqual(["az:B000000001"]);
  });

  it("ignores events that can't add files", async () => {
    await submitted("B000000001", 10);
    const services = createServices(store, fakeChaptarr().fetch);
    expect(await handleChaptarrWebhook({ db, services }, { eventType: "grab" })).toEqual({
      checked: false,
      available: [],
    });
  });
});
