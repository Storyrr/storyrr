import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { REQUEST_STATUSES, REQUEST_TRANSITIONS } from "#/lib/requests";
import { createDatabase, type AppDatabase } from "#/server/db/client";
import { media, request, requestEvent, requestWatcher, user } from "#/server/db/schema";

import {
  createRequest,
  InvalidTransitionError,
  RequestNotFoundError,
  transitionRequest,
  type CreateRequestInput,
} from "./transitions";

let db: AppDatabase;
let mediaId: string;

const target = { service: "chaptarr", rootFolderPath: "/audiobooks" } as const;

async function addUser(id: string) {
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
}

function input(overrides: Partial<CreateRequestInput> = {}): CreateRequestInput {
  return {
    mediaId,
    userId: "alice",
    format: "audiobook",
    target,
    autoApprove: false,
    ...overrides,
  };
}

function events(requestId: string) {
  return db
    .select({ actor: requestEvent.actor, from: requestEvent.fromStatus, to: requestEvent.toStatus })
    .from(requestEvent)
    .where(eq(requestEvent.requestId, requestId))
    .orderBy(requestEvent.createdAt)
    .all();
}

beforeEach(async () => {
  db = createDatabase(":memory:");
  await addUser("alice");
  await addUser("bob");
  const [row] = await db
    .insert(media)
    .values({
      type: "audiobook",
      source: "audible",
      externalId: "B000000001",
      title: "A Book",
      fetchedAt: new Date(),
    })
    .returning({ id: media.id });
  mediaId = row.id;
});

describe("transition table", () => {
  it("has no way out of terminal statuses", () => {
    for (const status of ["available", "denied", "cancelled"] as const) {
      expect(REQUEST_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("only names known statuses", () => {
    for (const targets of Object.values(REQUEST_TRANSITIONS)) {
      for (const status of targets) expect(REQUEST_STATUSES).toContain(status);
    }
  });
});

describe("createRequest", () => {
  it("creates a pending request with a creation event", () => {
    const result = createRequest(db, input());
    expect(result).toMatchObject({ kind: "created", status: "pending" });
    expect(events(result.requestId)).toEqual([{ actor: "alice", from: null, to: "pending" }]);
  });

  it("auto-approves when asked, as the system", () => {
    const result = createRequest(db, input({ autoApprove: true }));
    expect(result.status).toBe("approved");
    expect(events(result.requestId)).toEqual([
      { actor: "alice", from: null, to: "pending" },
      { actor: "system", from: "pending", to: "approved" },
    ]);
  });

  it("attaches a second requester as a watcher instead of duplicating", () => {
    const first = createRequest(db, input());
    const second = createRequest(db, input({ userId: "bob" }));
    expect(second).toEqual({ kind: "attached", requestId: first.requestId, status: "pending" });
    expect(db.select().from(request).all()).toHaveLength(1);
    expect(db.select({ userId: requestWatcher.userId }).from(requestWatcher).all()).toEqual([
      { userId: "bob" },
    ]);
  });

  it("doesn't make the requester watch their own request", () => {
    const first = createRequest(db, input());
    expect(createRequest(db, input()).requestId).toBe(first.requestId);
    expect(db.select().from(requestWatcher).all()).toHaveLength(0);
  });

  it("allows a separate request for another format or target", () => {
    const first = createRequest(db, input());
    const other = createRequest(
      db,
      input({ target: { service: "chaptarr", rootFolderPath: "/other" } }),
    );
    expect(other.kind).toBe("created");
    expect(other.requestId).not.toBe(first.requestId);
  });

  it("allows a new request once the previous one was denied", () => {
    const first = createRequest(db, input());
    transitionRequest(db, first.requestId, { to: "denied", actor: "admin" });
    expect(createRequest(db, input()).kind).toBe("created");
  });
});

describe("transitionRequest", () => {
  it("follows the happy path and records every step", () => {
    const { requestId } = createRequest(db, input());
    transitionRequest(db, requestId, { to: "approved", actor: "admin" });
    transitionRequest(db, requestId, {
      to: "submitted",
      actor: "system",
      backendRef: { authorId: 1, bookId: 2 },
    });
    transitionRequest(db, requestId, { to: "available", actor: "webhook" });

    const row = db.select().from(request).where(eq(request.id, requestId)).get();
    expect(row).toMatchObject({ status: "available", backendRef: { authorId: 1, bookId: 2 } });
    expect(events(requestId).map((e) => e.to)).toEqual([
      "pending",
      "approved",
      "submitted",
      "available",
    ]);
  });

  it("keeps the upstream error on failure and clears it on retry", () => {
    const { requestId } = createRequest(db, input({ autoApprove: true }));
    transitionRequest(db, requestId, {
      to: "failed",
      actor: "system",
      message: "401 from Chaptarr",
    });
    expect(db.select().from(request).get()?.lastError).toBe("401 from Chaptarr");

    transitionRequest(db, requestId, { to: "approved", actor: "admin" });
    expect(db.select().from(request).get()?.lastError).toBeNull();
  });

  it("rejects transitions the table doesn't allow, without side effects", () => {
    const { requestId } = createRequest(db, input());
    expect(() => transitionRequest(db, requestId, { to: "available", actor: "admin" })).toThrow(
      InvalidTransitionError,
    );
    expect(db.select().from(request).get()?.status).toBe("pending");
    expect(events(requestId)).toHaveLength(1);
  });

  it("rejects unknown requests", () => {
    expect(() => transitionRequest(db, "nope", { to: "approved", actor: "admin" })).toThrow(
      RequestNotFoundError,
    );
  });
});
