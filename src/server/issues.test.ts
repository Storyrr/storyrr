import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type AppDatabase } from "#/server/db/client";
import { media, user } from "#/server/db/schema";

import {
  addComment,
  canAccessIssue,
  createIssue,
  getIssue,
  listIssues,
  setIssueStatus,
} from "./issues";

let db: AppDatabase;
let mediaId: string;

beforeEach(async () => {
  db = createDatabase(":memory:");
  await db.insert(user).values([
    { id: "alice", name: "Alice", email: "alice@example.com" },
    { id: "bob", name: "Bob", email: "bob@example.com" },
    { id: "admin", name: "Admin", email: "admin@example.com" },
  ]);
  const [row] = await db
    .insert(media)
    .values({
      type: "ebook",
      source: "hardcover",
      externalId: "1",
      title: "Dune",
      fetchedAt: new Date(),
    })
    .returning({ id: media.id });
  mediaId = row.id;
});

describe("issues", () => {
  it("opens an issue with the report as first comment, then discusses and resolves it", () => {
    const id = createIssue(db, {
      mediaId,
      userId: "alice",
      type: "language",
      message: "It's in English",
    });
    addComment(db, { issueId: id, userId: "admin", message: "Replaced with the French edition" });
    expect(getIssue(db, id)).toMatchObject({
      status: "open",
      type: "language",
      reporter: { name: "Alice" },
      media: { title: "Dune" },
      comments: [
        { message: "It's in English", userName: "Alice" },
        { message: "Replaced with the French edition", userName: "Admin" },
      ],
    });
    expect(setIssueStatus(db, id, "resolved")).toBe(true);
    expect(getIssue(db, id)?.status).toBe("resolved");
  });

  it("lists open issues first, and only one's own for users", () => {
    const resolved = createIssue(db, { mediaId, userId: "alice", type: "other", message: "a" });
    setIssueStatus(db, resolved, "resolved");
    const open = createIssue(db, { mediaId, userId: "bob", type: "audio", message: "b" });
    expect(listIssues(db, {}).map((i) => i.id)).toEqual([open, resolved]);
    expect(listIssues(db, { userId: "alice" }).map((i) => i.id)).toEqual([resolved]);
    expect(listIssues(db, { status: "open" })).toMatchObject([{ id: open, comments: 1 }]);
  });

  it("lets only the reporter and admins in", () => {
    const id = createIssue(db, { mediaId, userId: "alice", type: "edition", message: "x" });
    expect(canAccessIssue(db, id, { id: "alice", isAdmin: false })).toBe(true);
    expect(canAccessIssue(db, id, { id: "bob", isAdmin: false })).toBe(false);
    expect(canAccessIssue(db, id, { id: "admin", isAdmin: true })).toBe(true);
    expect(canAccessIssue(db, "nope", { id: "admin", isAdmin: true })).toBe(false);
  });
});
