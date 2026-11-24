import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type AppDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { userSettings } from "#/server/settings/definitions";
import { createSettingsStore, type SettingsStore } from "#/server/settings/store";

import { upsertMedia } from "./queries";
import { requestQuota, setUserRequestLimits } from "./quota";
import { createRequest, transitionRequest } from "./transitions";

let db: AppDatabase;
let settings: SettingsStore;
const bob = { id: "b", isAdmin: false };
const target = { service: "chaptarr", rootFolderPath: "/audiobooks" } as const;

function requestBook(asin: string) {
  const mediaId = upsertMedia(db, {
    type: "audiobook",
    source: "audible",
    externalId: asin,
    title: asin,
    authors: [],
    narrators: [],
    series: [],
  });
  const result = createRequest(db, {
    mediaId,
    userId: bob.id,
    format: "audiobook",
    target,
    autoApprove: false,
  });
  if (result.kind !== "created") throw new Error("expected a new request");
  return result.requestId;
}

beforeEach(async () => {
  db = createDatabase(":memory:");
  settings = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
  await db.insert(user).values({ id: bob.id, name: "Bob", email: "b@example.com" });
});

describe("request quota", () => {
  it("is unlimited by default", async () => {
    requestBook("A1");
    expect(await requestQuota({ db, settings }, bob, "audiobook")).toMatchObject({
      limit: null,
      remaining: null,
    });
  });

  it("counts recent requests of the format, giving denied ones back", async () => {
    await settings.set(userSettings, {
      defaultPermissions: ["request_audiobook"],
      requestLimits: { audiobook: { limit: 2, days: 7 }, ebook: { limit: null, days: 7 } },
    });
    requestBook("A1");
    const denied = requestBook("A2");
    transitionRequest(db, denied, { to: "denied", actor: "admin" });
    requestBook("A3");
    expect(await requestQuota({ db, settings }, bob, "audiobook")).toEqual({
      limit: 2,
      days: 7,
      used: 2,
      remaining: 0,
    });
    // Outside the period, nothing counts.
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await requestQuota({ db, settings }, bob, "audiobook", later)).toMatchObject({
      remaining: 2,
    });
    expect(
      await requestQuota({ db, settings }, { ...bob, isAdmin: true }, "audiobook"),
    ).toMatchObject({ remaining: null });
  });

  it("prefers the user's own limits", async () => {
    setUserRequestLimits(db, bob.id, {
      audiobook: { limit: 1, days: 30 },
      ebook: { limit: null, days: 7 },
    });
    requestBook("A1");
    expect(await requestQuota({ db, settings }, bob, "audiobook")).toMatchObject({
      limit: 1,
      days: 30,
      remaining: 0,
    });
  });
});
