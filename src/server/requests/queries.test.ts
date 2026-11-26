import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import type { MediaSummary } from "#/lib/media";
import { createDatabase, type AppDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";

import { activeRequestsByExternalId, listRequests, upsertMedia } from "./queries";
import { createRequest, transitionRequest } from "./transitions";

let db: AppDatabase;

const item = (asin: string, title = "Dune"): MediaSummary => ({
  type: "audiobook",
  source: "audible",
  externalId: asin,
  title,
  authors: ["Frank Herbert"],
  narrators: [],
  series: [],
});

const target = { service: "chaptarr", rootFolderPath: "/audiobooks" } as const;

function request(mediaId: string, userId: string) {
  return createRequest(db, { mediaId, userId, format: "audiobook", target, autoApprove: false });
}

beforeEach(async () => {
  db = createDatabase(":memory:");
  await db.insert(user).values([
    { id: "alice", name: "Alice", email: "alice@example.com" },
    { id: "bob", name: "Bob", email: "bob@example.com" },
  ]);
});

describe("upsertMedia", () => {
  it("keeps one row per source and external id, refreshing its metadata", () => {
    const first = upsertMedia(db, item("B000000001"));
    const second = upsertMedia(db, item("B000000001", "Dune (new edition)"));
    expect(second).toBe(first);
  });
});

describe("activeRequestsByExternalId", () => {
  it("finds active requests with their requester, ignoring denied ones", () => {
    const a = upsertMedia(db, item("B000000001"));
    const b = upsertMedia(db, item("B000000002"));
    request(a, "alice");
    transitionRequest(db, request(b, "bob").requestId, { to: "denied", actor: "admin" });

    const found = activeRequestsByExternalId(db, {
      source: "audible",
      format: "audiobook",
      externalIds: ["B000000001", "B000000002"],
    });
    expect([...found.keys()]).toEqual(["B000000001"]);
    expect(found.get("B000000001")).toMatchObject({ status: "pending", requesterName: "Alice" });
  });
});

describe("listRequests", () => {
  it("shows users their own requests and those they watch", () => {
    const a = upsertMedia(db, item("B000000001"));
    const b = upsertMedia(db, item("B000000002"));
    const shared = request(a, "alice").requestId;
    request(a, "bob"); // attaches Bob as a watcher
    request(b, "alice");

    expect(listRequests(db, { userId: "bob", filter: "all" }).map((r) => r.id)).toEqual([shared]);
    expect(listRequests(db, { userId: "alice", filter: "all" })).toHaveLength(2);
    expect(listRequests(db, { filter: "all" }).find((r) => r.id === shared)?.watchers).toBe(1);
  });

  it("filters by status group, pending first", () => {
    const a = upsertMedia(db, item("B000000001"));
    const b = upsertMedia(db, item("B000000002"));
    const approved = request(a, "alice").requestId;
    transitionRequest(db, approved, { to: "approved", actor: "admin" });
    const pending = request(b, "alice").requestId;

    expect(listRequests(db, { filter: "all" }).map((r) => r.id)).toEqual([pending, approved]);
    expect(listRequests(db, { filter: "processing" }).map((r) => r.id)).toEqual([approved]);
  });

  it("filters declined requests and format, and sorts by date either way", () => {
    const a = upsertMedia(db, item("B000000001"));
    const b = upsertMedia(db, item("B000000002"));
    const first = request(a, "alice").requestId;
    const second = request(b, "alice").requestId;
    transitionRequest(db, first, { to: "denied", actor: "admin" });

    expect(listRequests(db, { filter: "declined" }).map((r) => r.id)).toEqual([first]);
    expect(listRequests(db, { filter: "all", format: "ebook" })).toHaveLength(0);
    const added = (order: "asc" | "desc") =>
      listRequests(db, { filter: "all", sort: "added", order }).map((r) => r.id);
    expect(added("asc")).toEqual(added("desc").toReversed());
    expect(added("asc")).toContain(second);
  });
});

describe("a deleted requester", () => {
  it("leaves the request, its history and its watchers", async () => {
    const mediaId = upsertMedia(db, item("B000000001"));
    const { requestId } = request(mediaId, "alice");
    request(mediaId, "bob");
    await db.delete(user).where(eq(user.id, "alice"));

    const [kept] = listRequests(db, { filter: "all" });
    expect(kept).toMatchObject({ id: requestId, watchers: 1 });
    expect(kept?.requester?.name ?? null).toBeNull();
    expect(listRequests(db, { userId: "bob", filter: "all" }).map((r) => r.id)).toEqual([
      requestId,
    ]);
    const active = activeRequestsByExternalId(db, {
      source: "audible",
      format: "audiobook",
      externalIds: ["B000000001"],
    });
    expect(active.get("B000000001")).toMatchObject({ status: "pending", requesterName: null });
  });
});
