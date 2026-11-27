import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type AppDatabase } from "#/server/db/client";
import { createServices } from "#/server/services/factory";
import { fakeFetch, json } from "#/server/services/test-utils";
import { deriveSettingsKey } from "#/server/settings/crypto";
import {
  audiobookshelfConnection,
  chaptarrConnection,
  jellyfinConnection,
  kavitaConnection,
} from "#/server/settings/definitions";
import { createSettingsStore, type SettingsStore } from "#/server/settings/store";

import { replaceIndex } from "./index";
import { libraryLinks } from "./links";

let db: AppDatabase;
let settings: SettingsStore;

/** Chaptarr answering the files of its books (by local id). */
function deps(files: Record<string, string> = {}) {
  const fake = fakeFetch((url) =>
    url.pathname === "/api/v1/bookfile"
      ? json([{ path: files[url.searchParams.get("bookId") ?? ""] ?? null }])
      : json([]),
  );
  return { db, settings, services: createServices(settings, fake.fetch), calls: fake.calls };
}

beforeEach(async () => {
  db = createDatabase(":memory:");
  settings = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
  await settings.set(kavitaConnection, {
    url: "http://kavita:5000",
    apiKey: "k",
    externalUrl: "https://read.example.test/",
  });
});

const goblet = {
  externalId: "383236",
  title: "Harry Potter and the Goblet of Fire",
  altTitles: ["Harry Potter et la Coupe de Feu"],
};

describe("libraryLinks", () => {
  it("links a title to its series in Kavita, at the address users open", async () => {
    replaceIndex(db, "kavita", [
      {
        itemId: "7",
        libraryId: "2",
        format: "ebook",
        externalId: null,
        titles: ["Harry Potter", "Harry Potter et la Coupe de Feu"],
        author: "",
      },
    ]);
    const d = deps();
    expect(await libraryLinks(d, "ebook", goblet)).toEqual([
      { service: "kavita", url: "https://read.example.test/library/2/series/7" },
    ]);
    // Found by title: Chaptarr isn't asked.
    expect(d.calls).toHaveLength(0);
  });

  it("finds by its file an item whose title a server has differently", async () => {
    await settings.set(chaptarrConnection, { url: "http://chaptarr:8789", apiKey: "k" });
    await settings.set(jellyfinConnection, { url: "http://jellyfin:8096", apiKey: "k" });
    await settings.set(audiobookshelfConnection, { url: "http://abs", apiKey: "k" });
    replaceIndex(db, "chaptarr", [
      {
        itemId: "16252",
        libraryId: "",
        format: "audiobook",
        externalId: "B08644S8BY",
        titles: ["La Machine à présages"],
        author: "Terry Goodkind",
      },
    ]);
    replaceIndex(db, "jellyfin", [
      {
        itemId: "d1d1",
        libraryId: "lib",
        format: "audiobook",
        externalId: null,
        titles: ["La Machine à Présages: L'Épée de Vérité"],
        author: "Terry Goodkind",
        paths: ["/media/audiobooks/Terry Goodkind/La Machine à Présages"],
      },
    ]);
    replaceIndex(db, "audiobookshelf", [
      {
        itemId: "6e9c",
        libraryId: "lib",
        format: "audiobook",
        externalId: null,
        titles: ["La Machine à Présages: L'Épée de Vérité"],
        author: "Terry Goodkind",
        paths: ["/audiobooks/Terry Goodkind/La Machine à Présages"],
      },
    ]);
    const d = deps({ 16252: "/data/audiobooks/Terry Goodkind/La Machine à Présages/01.mp3" });
    const item = { externalId: "B08644S8BY", title: "La Machine à présages" };

    expect(await libraryLinks(d, "audiobook", item)).toEqual([
      { service: "audiobookshelf", url: "http://abs/audiobookshelf/item/6e9c" },
      { service: "jellyfin", url: "http://jellyfin:8096/web/index.html#/details?id=d1d1" },
    ]);
    expect(d.calls.map((call) => call.url.searchParams.get("bookId"))).toEqual(["16252"]);
  });

  it("gives nothing for a title no server holds, or without a media server", async () => {
    expect(await libraryLinks(deps(), "ebook", goblet)).toEqual([]);
    await settings.remove(kavitaConnection);
    expect(await libraryLinks(deps(), "ebook", goblet)).toEqual([]);
  });
});
