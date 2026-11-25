import { beforeEach, describe, expect, it } from "vitest";

import { expandPermissions, type Permission } from "#/lib/permissions";
import { createDatabase, type AppDatabase } from "#/server/db/client";
import { media, user } from "#/server/db/schema";
import product from "#/server/services/audible/fixtures/product-B07Q44JYLF.fr.json" with { type: "json" };
import { fakeChaptarr } from "#/server/services/chaptarr/fake";
import { createServices } from "#/server/services/factory";
import { json } from "#/server/services/test-utils";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { audiobookDefaults, chaptarrConnection, userSettings } from "#/server/settings/definitions";
import { createSettingsStore, type SettingsStore } from "#/server/settings/store";

import { block } from "./blocklist";
import { clearLanguagePolicyCache } from "./language-policy";
import { requestTitle, RequestRefusedError } from "./request-title";
import { createRequest } from "./transitions";

const ASIN = "B07Q44JYLF";
const dune = { media: { type: "audiobook" as const, id: ASIN } };

let db: AppDatabase;
let settings: SettingsStore;
let approved: string[];

function deps(chaptarr = fakeChaptarr()) {
  // Audible answers with the recorded Dune product; everything else is Chaptarr.
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.hostname.startsWith("api.audible."))
      return url.pathname.endsWith(ASIN) ? json(product) : json({}, 404);
    return chaptarr.fetch(input, init);
  };
  return {
    db,
    settings,
    services: createServices(settings, fetch),
    onApproved: (id: string) => approved.push(id),
  };
}

const caller = (id: string, granted: Permission[], role: string | null = null) => ({
  user: { id, role },
  permissions: expandPermissions(granted),
});

/** The refusal's HTTP status, or "ok". */
async function outcome(promise: Promise<unknown>): Promise<number | "ok"> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof RequestRefusedError) return error.status;
    throw error;
  }
}

beforeEach(async () => {
  clearLanguagePolicyCache();
  approved = [];
  db = createDatabase(":memory:");
  settings = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
  await settings.set(chaptarrConnection, { url: "http://chaptarr:8789", apiKey: "k" });
  await settings.set(audiobookDefaults, {
    rootFolderPath: "/audiobooks",
    qualityProfileId: 1,
    metadataProfileId: 2,
  });
  await db.insert(user).values([
    { id: "alice", name: "Alice", email: "alice@example.com" },
    { id: "bob", name: "Bob", email: "bob@example.com" },
  ]);
});

describe("requestTitle", () => {
  it("refuses users without the format's request permission", async () => {
    expect(await outcome(requestTitle(deps(), caller("alice", ["request_ebook"]), dune))).toBe(403);
  });

  it("files a pending request in the default folder", async () => {
    const pending = await requestTitle(deps(), caller("alice", ["request_audiobook"]), dune);
    expect(pending).toMatchObject({ kind: "created", status: "pending" });
    expect(approved).toEqual([]);
  });

  it("approves it right away for auto-approved users, and submits it", async () => {
    const auto = await requestTitle(
      deps(),
      caller("alice", ["request_audiobook", "auto_approve_audiobook"]),
      dune,
    );
    expect(auto).toMatchObject({ kind: "created", status: "approved" });
    expect(approved).toEqual([auto.requestId]);
  });

  it("ignores a chosen folder without Advanced requests", async () => {
    const request = { ...dune, rootFolderPath: "/elsewhere" };
    const plain = await requestTitle(deps(), caller("alice", ["request_audiobook"]), request);
    const advanced = await requestTitle(
      deps(),
      caller("bob", ["request_audiobook", "request_advanced"]),
      request,
    );
    // Different folders: two requests instead of one joined.
    expect(plain.requestId).not.toBe(advanced.requestId);
  });

  it("refuses blocked titles", async () => {
    block(
      db,
      { type: "audiobook", source: "audible", externalId: ASIN, title: "Dune" },
      { reason: null, userId: "bob" },
    );
    expect(await outcome(requestTitle(deps(), caller("alice", ["request_audiobook"]), dune))).toBe(
      409,
    );
  });

  it("refuses a language Chaptarr's metadata profile filters out", async () => {
    const chaptarr = fakeChaptarr({
      metadataProfiles: [{ id: 2, name: "English", allowedLanguages: "eng" }],
    });
    expect(
      await outcome(requestTitle(deps(chaptarr), caller("alice", ["request_audiobook"]), dune)),
    ).toBe(422);
  });

  it("counts new requests against the limit, but joining one is free", async () => {
    await settings.set(userSettings, {
      defaultPermissions: ["request_audiobook"],
      requestLimits: { audiobook: { limit: 1, days: 7 }, ebook: { limit: null, days: 7 } },
    });
    // Alice already used her one audiobook request this week.
    const [other] = await db
      .insert(media)
      .values({
        type: "audiobook",
        source: "audible",
        externalId: "B000000000",
        title: "Hyperion",
        fetchedAt: new Date(),
      })
      .returning({ id: media.id });
    createRequest(db, {
      mediaId: other.id,
      userId: "alice",
      format: "audiobook",
      target: { service: "chaptarr", rootFolderPath: "/audiobooks" },
      autoApprove: false,
    });
    expect(await outcome(requestTitle(deps(), caller("alice", ["request_audiobook"]), dune))).toBe(
      429,
    );

    // An admin's request (no limit) is joined by Alice at no cost.
    await requestTitle(deps(), caller("bob", ["admin"], "admin"), dune);
    const joined = await requestTitle(deps(), caller("alice", ["request_audiobook"]), dune);
    expect(joined.kind).toBe("attached");
  });
});
