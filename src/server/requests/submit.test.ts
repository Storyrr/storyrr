import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { describeRequestError } from "#/lib/request-errors";
import { createDatabase, type AppDatabase } from "#/server/db/client";
import { libraryItem, media, request, user } from "#/server/db/schema";
import { createServices } from "#/server/services/factory";
import { book, fakeChaptarr } from "#/server/services/chaptarr/fake";
import { deriveSettingsKey } from "#/server/settings/crypto";
import {
  audiobookDefaults,
  chaptarrConnection,
  ebookDefaults,
} from "#/server/settings/definitions";
import { createSettingsStore, type SettingsStore } from "#/server/settings/store";

import { checkAvailability, removeDeleted } from "./availability";
import { clearLanguagePolicyCache } from "./language-policy";
import { listRequests } from "./queries";
import { failStuckRequests, submitApproved, submitRequest } from "./submit";
import { createRequest } from "./transitions";

let db: AppDatabase;
let settings: SettingsStore;
let requestId: string;

function deps(chaptarr = fakeChaptarr()) {
  return {
    db,
    settings,
    services: createServices(settings, chaptarr.fetch),
    chaptarr,
  };
}

const statusOf = (id: string) => db.select().from(request).where(eq(request.id, id)).get();

beforeEach(async () => {
  clearLanguagePolicyCache();
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
      backendRef: { chaptarrBookId: 42, chaptarrForeignBookId: "hc:1" },
    });
    expect(d.chaptarr.bodyOf("POST", "/api/v1/book/import")).toMatchObject({
      mediaType: "audiobook",
      rootFolder: "/audiobooks-fr",
      qualityProfileId: 1,
      metadataProfileId: 2,
    });
  });

  it("fails with an explainable reason when Chaptarr isn't configured", async () => {
    await settings.remove(chaptarrConnection);
    expect(await submitRequest(deps(), requestId)).toBe("failed");
    expect(describeRequestError(statusOf(requestId)?.lastError)).toMatch(
      /Chaptarr isn't connected/,
    );
  });

  it("stays approved while Chaptarr is down, for the job to try again", async () => {
    const d = deps();
    const down = createServices(settings, () => Promise.resolve(new Response("", { status: 503 })));
    expect(await submitRequest({ ...d, services: down }, requestId)).toBe("approved");
    expect(statusOf(requestId)?.status).toBe("approved");
    expect(await submitRequest(d, requestId)).toBe("submitted");
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
    expect(d.chaptarr.calls("POST", "/api/v1/book/import")).toHaveLength(1);
  });
});

describe("concurrent submissions", () => {
  it("sends a request to Chaptarr once when the job and an approval race", async () => {
    const d = deps();
    const results = await Promise.all([submitRequest(d, requestId), submitRequest(d, requestId)]);
    expect(results.toSorted()).toEqual(["skipped", "submitted"]);
    expect(d.chaptarr.calls("POST", "/api/v1/book/import")).toHaveLength(1);
  });
});

describe("checkAvailability", () => {
  it("marks a submitted request available once Audiobookshelf holds its ASIN", async () => {
    const d = deps();
    await submitRequest(d, requestId);
    expect(await checkAvailability(d)).toEqual([]);

    await db.insert(libraryItem).values({
      backend: "audiobookshelf",
      format: "audiobook",
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
    d.chaptarr.state.lookup = [book(42, "ebook", 1), book(42, "audiobook", 0)];
    expect(await checkAvailability(d)).toEqual([]);
    d.chaptarr.state.lookup = [book(42, "audiobook", 1)];
    expect(await checkAvailability(d, { actor: "webhook" })).toEqual([requestId]);
  });
});

/** A request Chaptarr delivered. */
async function delivered() {
  const d = deps();
  await submitRequest(d, requestId);
  d.chaptarr.state.lookup = [book(42, "audiobook", 1)];
  await checkAvailability(d);
  return d;
}

describe("removeDeleted", () => {
  it("keeps a delivered request while Chaptarr or a library holds the book", async () => {
    const d = await delivered();
    // Chaptarr still reports the file.
    expect(await removeDeleted(d)).toEqual([]);

    // Its file is gone from Chaptarr, but Audiobookshelf has the book.
    d.chaptarr.state.lookup = [book(42, "audiobook", 0)];
    await db.insert(libraryItem).values({
      backend: "audiobookshelf",
      format: "audiobook",
      itemId: "li1",
      libraryId: "lib",
      externalId: "B07Q44JYLF",
      title: "Dune",
      author: "Frank Herbert",
      syncedAt: new Date(),
    });
    expect(await removeDeleted(d)).toEqual([]);
    expect(statusOf(requestId)?.status).toBe("available");
  });

  it("marks it removed once the file is gone everywhere, so it can be requested again", async () => {
    const d = await delivered();
    d.chaptarr.state.lookup = [book(42, "audiobook", 0)];
    expect(await removeDeleted(d)).toEqual([requestId]);
    expect(statusOf(requestId)?.status).toBe("removed");

    const again = createRequest(db, {
      mediaId: statusOf(requestId)!.mediaId,
      userId: "alice",
      format: "audiobook",
      target: { service: "chaptarr", rootFolderPath: "/audiobooks-fr" },
      autoApprove: false,
    });
    expect(again.kind).toBe("created");
  });

  it("leaves it alone when Chaptarr can't be asked", async () => {
    const d = await delivered();
    const down = createServices(settings, () => Promise.resolve(new Response("", { status: 503 })));
    expect(await removeDeleted({ ...d, services: down })).toEqual([]);
    expect(statusOf(requestId)?.status).toBe("available");
  });
});

async function ebookRequest() {
  await settings.set(ebookDefaults, {
    rootFolderPath: "/books",
    qualityProfileId: 3,
    metadataProfileId: 4,
  });
  const [row] = await db
    .insert(media)
    .values({
      type: "ebook",
      source: "hardcover",
      externalId: "312460",
      title: "Dune",
      // As upsertMedia stores it: the provider item, languages included.
      metadata: { languages: ["eng"] },
      fetchedAt: new Date(),
    })
    .returning({ id: media.id });
  return createRequest(db, {
    mediaId: row.id,
    userId: "alice",
    format: "ebook",
    target: { service: "chaptarr", rootFolderPath: "/manga" },
    autoApprove: true,
  }).requestId;
}

describe("eBooks", () => {
  it("sends an eBook to Chaptarr by its Hardcover id, with the eBook defaults", async () => {
    const id = await ebookRequest();
    const d = deps(fakeChaptarr({ lookup: [{ ...book(0, "ebook"), foreignBookId: "hc:312460" }] }));
    expect(await submitRequest(d, id)).toBe("submitted");
    expect(d.chaptarr.calls("GET", "/api/v1/book/lookup")[0]?.url.searchParams.get("term")).toBe(
      "hc:312460",
    );
    expect(d.chaptarr.bodyOf("POST", "/api/v1/book/import")).toMatchObject({
      foreignBookId: "hc:312460",
      mediaType: "ebook",
      rootFolder: "/manga",
      qualityProfileId: 3,
      metadataProfileId: 4,
    });
  });

  it("explains missing eBook defaults", async () => {
    const id = await ebookRequest();
    await settings.remove(ebookDefaults);
    expect(await submitRequest(deps(), id)).toBe("failed");
    expect(describeRequestError(statusOf(id)?.lastError)).toMatch(/for eBooks/);
  });

  it("turns available once Kavita holds a series with that title", async () => {
    const id = await ebookRequest();
    const d = deps(fakeChaptarr({ lookup: [{ ...book(0, "ebook"), foreignBookId: "hc:312460" }] }));
    await submitRequest(d, id);
    d.chaptarr.state.lookup = [];
    expect(await checkAvailability(d)).toEqual([]);
    await db.insert(libraryItem).values({
      backend: "kavita",
      format: "ebook",
      itemId: "7#0",
      libraryId: "1",
      externalId: null,
      matchKey: "dune",
      title: "Dune",
      author: "",
      syncedAt: new Date(),
    });
    expect(await checkAvailability(d)).toEqual([id]);
  });

  it("doesn't trust a title a library already held when the request was sent", async () => {
    const id = await ebookRequest();
    // Another "Dune" is already in Kavita.
    await db.insert(libraryItem).values({
      backend: "kavita",
      format: "ebook",
      itemId: "7#0",
      libraryId: "1",
      externalId: null,
      matchKey: "dune",
      title: "Dune",
      author: "",
      syncedAt: new Date(),
    });
    const d = deps(fakeChaptarr({ lookup: [{ ...book(0, "ebook"), foreignBookId: "hc:312460" }] }));
    await submitRequest(d, id);
    d.chaptarr.state.lookup = [];
    expect(await checkAvailability(d)).toEqual([]);
    // Chaptarr's own file still counts.
    d.chaptarr.state.lookup = [book(2, "ebook", 1)];
    expect(await checkAvailability(d)).toEqual([id]);
  });
});

describe("languages Chaptarr accepts", () => {
  const frenchOnly = [{ id: 4, name: "Ebook Default", allowedLanguages: "fre,fra" }];

  it("refuses to send a work its metadata profile filters out, with the reason", async () => {
    const id = await ebookRequest();
    const d = deps(fakeChaptarr({ metadataProfiles: frenchOnly }));
    expect(await submitRequest(d, id)).toBe("failed");
    expect(d.chaptarr.calls("POST", "/api/v1/book/import")).toHaveLength(0);
    expect(describeRequestError(statusOf(id)?.lastError)).toMatch(/only accepts books in French/);
  });

  it("marks a request Chaptarr only queued as waiting, and fails it once its language is refused", async () => {
    const id = await ebookRequest();
    const pending = fakeChaptarr({
      lookup: [{ ...book(0, "ebook"), foreignBookId: "hc:312460" }],
      importResponse: { status: 202, body: { pendingId: 1 } },
    });
    expect(await submitRequest(deps(pending), id)).toBe("submitted");
    expect(listRequests(db, { filter: "all" }).find((r) => r.id === id)?.waitingForChaptarr).toBe(
      true,
    );

    // Later, Chaptarr's profile turns out to be French-only.
    clearLanguagePolicyCache();
    expect(await failStuckRequests(deps(fakeChaptarr({ metadataProfiles: frenchOnly })))).toEqual([
      id,
    ]);
    expect(statusOf(id)?.status).toBe("failed");
  });
});
