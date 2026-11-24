import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { describeRequestError } from "#/lib/request-errors";
import { createDatabase, type AppDatabase } from "#/server/db/client";
import { media, request, user } from "#/server/db/schema";
import { createServices } from "#/server/services/factory";
import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { audiobookshelfConnection } from "#/server/settings/definitions";
import { createSettingsStore, type SettingsStore } from "#/server/settings/store";

import { submitRequest } from "./submit";
import { createRequest } from "./transitions";

let db: AppDatabase;
let settings: SettingsStore;
let requestId: string;

const libraries = {
  libraries: [
    {
      id: "lib-books",
      name: "Livres audio",
      mediaType: "book",
      folders: [{ id: "f-b", fullPath: "/audiobooks" }],
    },
    {
      id: "lib-pods",
      name: "Podcasts",
      mediaType: "podcast",
      folders: [{ id: "f-p", fullPath: "/podcasts/" }],
    },
  ],
};

function fakeAbs(create: () => Response = () => json({ id: "li_1" })) {
  return fakeFetch((url) => {
    if (url.pathname === "/api/libraries") return json(libraries);
    if (url.pathname === "/api/podcasts/feed") {
      return json({
        podcast: {
          metadata: { description: "<p>Un podcast</p>", language: "fr", explicit: false },
        },
      });
    }
    if (url.pathname === "/api/podcasts") return create();
    return json({}, 404);
  });
}

const statusOf = () => db.select().from(request).where(eq(request.id, requestId)).get();

beforeEach(async () => {
  db = createDatabase(":memory:");
  settings = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
  await settings.set(audiobookshelfConnection, { url: "http://audiobookshelf", apiKey: "k" });
  await db.insert(user).values({ id: "alice", name: "Alice", email: "alice@example.com" });
  const [row] = await db
    .insert(media)
    .values({
      type: "podcast",
      source: "itunes",
      externalId: "1172772210",
      title: "La Poudre: saison 2?",
      authors: ["Lauren Bastide"],
      coverUrl: "https://example.com/cover.jpg",
      metadata: {
        feedUrl: "https://feeds.example.com/poudre.xml",
        authors: ["Lauren Bastide"],
        coverUrl: "https://example.com/cover.jpg",
        genres: ["Société"],
      },
      fetchedAt: new Date(),
    })
    .returning({ id: media.id });
  requestId = createRequest(db, {
    mediaId: row.id,
    userId: "alice",
    format: "podcast",
    target: { service: "audiobookshelf", libraryId: "lib-pods", folderId: "f-p" },
    autoApprove: true,
  }).requestId;
});

describe("podcast submission", () => {
  it("creates the podcast in the chosen folder, auto-download on, and makes it available", async () => {
    const abs = fakeAbs();
    const status = await submitRequest(
      { db, settings, services: createServices(settings, abs.fetch) },
      requestId,
    );

    expect(status).toBe("available");
    const create = abs.calls.find((c) => c.url.pathname === "/api/podcasts");
    expect(jsonBody(create?.init)).toEqual({
      libraryId: "lib-pods",
      folderId: "f-p",
      path: "/podcasts/La Poudre - saison 2",
      media: {
        metadata: {
          title: "La Poudre: saison 2?",
          author: "Lauren Bastide",
          description: "<p>Un podcast</p>",
          genres: ["Société"],
          feedUrl: "https://feeds.example.com/poudre.xml",
          imageUrl: "https://example.com/cover.jpg",
          itunesId: "1172772210",
          language: "fr",
          explicit: false,
        },
        autoDownloadEpisodes: true,
      },
    });
    expect(statusOf()?.backendRef).toEqual({ absItemId: "li_1" });
  });

  it("counts a podcast Audiobookshelf already has as available", async () => {
    const abs = fakeAbs(() => new Response("Podcast already exists", { status: 400 }));
    expect(
      await submitRequest(
        { db, settings, services: createServices(settings, abs.fetch) },
        requestId,
      ),
    ).toBe("available");
  });

  it("explains a library folder that disappeared", async () => {
    libraries.libraries[1].folders = [];
    const abs = fakeAbs();
    expect(
      await submitRequest(
        { db, settings, services: createServices(settings, abs.fetch) },
        requestId,
      ),
    ).toBe("failed");
    expect(describeRequestError(statusOf()?.lastError)).toMatch(/no longer exists/);
    libraries.libraries[1].folders = [{ id: "f-p", fullPath: "/podcasts/" }];
  });
});
