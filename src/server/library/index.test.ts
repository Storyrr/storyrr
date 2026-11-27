import { describe, expect, it } from "vitest";

import { titleKey } from "#/lib/match";
import { createDatabase } from "#/server/db/client";
import { createChaptarrClient } from "#/server/services/chaptarr/client";
import { createKavitaClient } from "#/server/services/kavita/client";
import { createJellyfinClient } from "#/server/services/jellyfin/client";
import { createKomgaClient } from "#/server/services/komga/client";
import { fakeFetch, json } from "#/server/services/test-utils";

import {
  libraryStats,
  ownedAsins,
  ownedTitles,
  replaceIndex,
  ownedHardcoverIds,
  syncChaptarr,
  syncJellyfin,
  syncKavita,
  syncKomga,
} from "./index";

describe("Kavita library index", () => {
  it("indexes every name of every series and matches titles loosely", async () => {
    const db = createDatabase(":memory:");
    const { fetch } = fakeFetch((url) =>
      url.pathname === "/api/Plugin/authenticate"
        ? json({ token: "jwt" })
        : json([
            { id: 1, name: "L'Étranger", localizedName: null, originalName: null, libraryId: 1 },
            {
              id: 2,
              name: "Berserk",
              localizedName: "ベルセルク",
              originalName: null,
              libraryId: 2,
            },
          ]),
    );
    const kavita = createKavitaClient({ url: "http://kavita", apiKey: "k" }, fetch);

    expect(await syncKavita(db, kavita)).toEqual({ ok: true, value: { series: 2 } });
    expect(ownedTitles(db, "ebook", ["L’étranger", "ベルセルク", "Dune"])).toEqual(
      new Set([titleKey("L'Etranger"), titleKey("ベルセルク")]),
    );

    // A second sync replaces the previous index.
    const empty = createKavitaClient(
      { url: "http://kavita", apiKey: "k" },
      fakeFetch((url) =>
        url.pathname === "/api/Plugin/authenticate" ? json({ token: "jwt" }) : json([]),
      ).fetch,
    );
    await syncKavita(db, empty);
    expect(ownedTitles(db, "ebook", ["Berserk"]).size).toBe(0);
  });

  it("leaves excluded libraries out and counts items per library", async () => {
    const db = createDatabase(":memory:");
    const { fetch } = fakeFetch((url) =>
      url.pathname === "/api/Plugin/authenticate"
        ? json({ token: "jwt" })
        : json([
            { id: 1, name: "Dune", libraryId: 1 },
            { id: 2, name: "Berserk", libraryId: 2 },
          ]),
    );
    const kavita = createKavitaClient({ url: "http://kavita", apiKey: "k" }, fetch);
    const now = new Date("2026-11-24T10:00:00Z");

    expect(await syncKavita(db, kavita, { excluded: ["2"], now })).toEqual({
      ok: true,
      value: { series: 1 },
    });
    expect(ownedTitles(db, "ebook", ["Berserk"]).size).toBe(0);
    expect(libraryStats(db, "kavita")).toEqual({
      counts: new Map([["1", 1]]),
      lastSyncedAt: now,
    });
  });
});

describe("a failed sync", () => {
  it("keeps the index it had while the media server is down", async () => {
    const db = createDatabase(":memory:");
    const up = fakeFetch((url) =>
      url.pathname === "/api/Plugin/authenticate"
        ? json({ token: "jwt" })
        : json([{ id: 1, name: "Dune", libraryId: 1 }]),
    );
    await syncKavita(db, createKavitaClient({ url: "http://kavita", apiKey: "k" }, up.fetch));

    const down = fakeFetch(() => new Response("Bad Gateway", { status: 502 }));
    const result = await syncKavita(
      db,
      createKavitaClient({ url: "http://kavita", apiKey: "k" }, down.fetch),
    );
    expect(result.ok).toBe(false);
    expect(ownedTitles(db, "ebook", ["Dune"])).toEqual(new Set(["dune"]));
  });
});

describe("ownership", () => {
  it("matches Audiobookshelf by ASIN only, the others by title", () => {
    const db = createDatabase(":memory:");
    replaceIndex(db, "audiobookshelf", [
      {
        itemId: "abs1",
        libraryId: "lib",
        format: "audiobook",
        externalId: "B07Q44JYLF",
        // Folder-derived title: wrong, so never trusted.
        titles: ["T01-Dune"],
        author: "Benjamin Jungers",
      },
      {
        itemId: "abs2",
        libraryId: "lib",
        format: "audiobook",
        externalId: null,
        titles: ["Hyperion"],
        author: "",
      },
    ]);
    replaceIndex(db, "jellyfin", [
      {
        itemId: "jf1",
        libraryId: "lib",
        format: "audiobook",
        externalId: null,
        titles: ["Foundation"],
        author: "",
      },
    ]);

    expect(ownedAsins(db, ["b07q44jylf", "B000000000"])).toEqual(new Set(["B07Q44JYLF"]));
    expect(ownedTitles(db, "audiobook", ["Hyperion", "Foundation", "T01-Dune"])).toEqual(
      new Set(["foundation"]),
    );
    // Formats stay apart.
    expect(ownedTitles(db, "ebook", ["Foundation"]).size).toBe(0);
  });
});

describe("Komga library index", () => {
  it("indexes series titles as eBooks only", async () => {
    const db = createDatabase(":memory:");
    const { fetch } = fakeFetch((url) =>
      json({
        content: url.pathname.endsWith("/books/list")
          ? []
          : [
              {
                id: "s1",
                libraryId: "lib",
                name: "dune",
                metadata: { title: "Dune", alternateTitles: [] },
              },
            ],
        last: true,
      }),
    );
    const komga = createKomgaClient({ url: "http://komga", apiKey: "k" }, fetch);

    expect(await syncKomga(db, komga)).toEqual({ ok: true, value: { items: 1 } });
    expect(ownedTitles(db, "ebook", ["Dune"])).toEqual(new Set(["dune"]));
    expect(ownedTitles(db, "audiobook", ["Dune"]).size).toBe(0);
    expect(libraryStats(db, "komga").counts).toEqual(new Map([["lib", 1]]));
  });
});

describe("Jellyfin library index", () => {
  it("groups an audiobook's files and keeps each format apart", async () => {
    const db = createDatabase(":memory:");
    const { fetch } = fakeFetch((url) =>
      url.pathname === "/Library/VirtualFolders"
        ? json([{ Name: "Books", ItemId: "lib", CollectionType: "books" }])
        : json({
            Items: [
              { Id: "f1", Name: "Part 1", Type: "AudioBook", Album: "Dune" },
              { Id: "f2", Name: "Part 2", Type: "AudioBook", Album: "Dune" },
              { Id: "b1", Name: "Hyperion", Type: "Book" },
            ],
          }),
    );
    const jellyfin = createJellyfinClient({ url: "http://jellyfin", apiKey: "k" }, fetch);

    expect(await syncJellyfin(db, jellyfin)).toEqual({ ok: true, value: { items: 2 } });
    expect(ownedTitles(db, "audiobook", ["Dune", "Hyperion"])).toEqual(new Set(["dune"]));
    expect(ownedTitles(db, "ebook", ["Dune", "Hyperion"])).toEqual(new Set(["hyperion"]));
    expect(libraryStats(db, "jellyfin").counts).toEqual(new Map([["lib", 2]]));
  });
});

const chaptarrWith = (records: unknown[]) => {
  const fake = fakeFetch((url) =>
    url.pathname === "/api/v1/book/paged"
      ? json({ records, totalCount: records.length })
      : json([]),
  );
  return {
    ...fake,
    chaptarr: createChaptarrClient({ url: "http://chaptarr", apiKey: "k" }, fake.fetch),
  };
};

describe("Chaptarr library index", () => {
  it("indexes the books Chaptarr holds a file of by their IDs and titles", async () => {
    const db = createDatabase(":memory:");
    const { chaptarr, calls } = chaptarrWith([
      // An eBook known by its Hardcover id; a French title Hardcover names in English.
      {
        id: 1,
        title: "Harry Potter et la Coupe de Feu",
        mediaType: "ebook",
        foreignBookId: "hc:383236",
        hardcoverBookId: "hc:383236",
      },
      // An audiobook under two ASINs (two editions) and a Hardcover id.
      {
        id: 2,
        title: "La Machine à présages",
        mediaType: "audiobook",
        foreignBookId: "hc:459325",
        asin: "B08644S8BY",
        audibleASIN: "b08644zqf1",
      },
      {
        id: 3,
        title: "Le Cœur de la guerre",
        mediaType: "audiobook",
        foreignBookId: "az:B08F7YXNJF",
      },
      // No ID Storyrr knows: left out.
      { id: 4, title: "Treasure Island", mediaType: "ebook", foreignBookId: "gr:125891353" },
    ]);

    expect(await syncChaptarr(db, chaptarr)).toEqual({ ok: true, value: { items: 4 } });
    expect(calls[0]?.url.searchParams.get("downloaded")).toBe("true");
    expect(ownedHardcoverIds(db, ["383236", "459325", "1"])).toEqual(new Set(["383236"]));
    expect(ownedAsins(db, ["B08644S8BY", "B08644ZQF1", "B08F7YXNJF", "B000000000"])).toEqual(
      new Set(["B08644S8BY", "B08644ZQF1", "B08F7YXNJF"]),
    );
    // Another marketplace's ASIN of the same audiobook: found by title.
    expect(ownedTitles(db, "audiobook", ["Le cœur de la guerre"]).size).toBe(1);
  });

  it("forgets a book whose file was deleted, and keeps the index when Chaptarr is down", async () => {
    const db = createDatabase(":memory:");
    const book = { id: 1, title: "Dune", mediaType: "ebook", foreignBookId: "hc:312460" };
    await syncChaptarr(db, chaptarrWith([book]).chaptarr);

    const down = createChaptarrClient(
      { url: "http://chaptarr", apiKey: "k" },
      fakeFetch(() => new Response("", { status: 503 })).fetch,
    );
    expect((await syncChaptarr(db, down)).ok).toBe(false);
    expect(ownedHardcoverIds(db, ["312460"]).size).toBe(1);

    await syncChaptarr(db, chaptarrWith([]).chaptarr);
    expect(ownedHardcoverIds(db, ["312460"]).size).toBe(0);
  });
});
