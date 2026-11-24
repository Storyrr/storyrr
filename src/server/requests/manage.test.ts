import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type AppDatabase } from "#/server/db/client";
import { request, user } from "#/server/db/schema";
import { mediaSources } from "#/server/sources";

import { clearTitleData, markAvailable, titleAdminInfo } from "./manage";
import { upsertMedia } from "./queries";
import { createRequest } from "./transitions";

let db: AppDatabase;
const dune = {
  type: "audiobook" as const,
  source: "audible",
  externalId: "B0TEST",
  title: "Dune",
  authors: ["Frank Herbert"],
  narrators: [],
  series: [],
};

beforeEach(async () => {
  db = createDatabase(":memory:");
  await db.insert(user).values({ id: "bob", name: "Bob", email: "b@example.com" });
  createRequest(db, {
    mediaId: upsertMedia(db, dune),
    userId: "bob",
    format: "audiobook",
    target: { service: "chaptarr", rootFolderPath: "/a" },
    autoApprove: false,
  });
});

describe("title admin", () => {
  it("marks a title available: owned from now on, its pending request fulfilled", () => {
    expect(markAvailable(db, dune, "admin")).toBe(1);
    expect(mediaSources.audiobook.owned(db, [dune]).has("B0TEST")).toBe(true);
    const info = titleAdminInfo(db, "audible", "B0TEST");
    expect(info.markedAvailable).toBe(true);
    expect(info.requests.map((r) => r.status)).toEqual(["available"]);
  });

  it("clears requests and the manual mark", () => {
    markAvailable(db, dune, "admin");
    clearTitleData(db, "audible", "B0TEST");
    expect(db.select().from(request).all()).toHaveLength(0);
    expect(mediaSources.audiobook.owned(db, [dune]).size).toBe(0);
  });
});
