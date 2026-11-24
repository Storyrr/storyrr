import { describe, expect, it } from "vitest";

import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import { createAudiobookshelfClient, sanitizeFilename } from "./client";

const connection = { url: "http://audiobookshelf/", apiKey: "abs-key" };

const bookItem = (id: string, asin: string | null) => ({
  id,
  media: { metadata: { title: `Title ${id}`, authorName: "Author", asin } },
});

describe("Audiobookshelf client", () => {
  it("indexes book items (with normalized ASINs, across pages) and podcast feeds", async () => {
    const page0 = Array.from({ length: 200 }, (_, i) => bookItem(`a${i}`, null));
    const { fetch, calls } = fakeFetch((url) => {
      if (url.pathname === "/api/libraries") {
        return json({
          libraries: [
            { id: "lib-books", name: "Audiobooks", mediaType: "book", folders: [] },
            { id: "lib-pods", name: "Podcasts", mediaType: "podcast", folders: [] },
          ],
        });
      }
      if (url.pathname === "/api/libraries/lib-books/items") {
        return json({
          results:
            url.searchParams.get("page") === "0" ? page0 : [bookItem("last", " b07q44jylf ")],
        });
      }
      if (url.pathname === "/api/libraries/lib-pods/items") {
        return json({
          results: [
            {
              id: "p1",
              media: {
                metadata: {
                  title: "La Poudre",
                  author: "Lauren Bastide",
                  feedUrl: "https://feeds.example.com/x.xml",
                },
              },
            },
          ],
        });
      }
      return json({}, 404);
    });

    const result = await createAudiobookshelfClient(connection, fetch).allItems();

    expect(result.ok && result.value).toHaveLength(202);
    expect(result.ok && result.value.find((i) => i.itemId === "last")).toEqual({
      kind: "book",
      itemId: "last",
      libraryId: "lib-books",
      asin: "B07Q44JYLF",
      feedUrl: null,
      title: "Title last",
      author: "Author",
    });
    expect(result.ok && result.value.at(-1)).toMatchObject({
      kind: "podcast",
      feedUrl: "https://feeds.example.com/x.xml",
      asin: null,
      author: "Lauren Bastide",
    });
    expect(calls[0]?.init?.headers).toMatchObject({ Authorization: "Bearer abs-key" });
  });

  it("creates a podcast the way ABS's own client does", async () => {
    const { fetch, calls } = fakeFetch(() => json({ id: "li_new", mediaType: "podcast" }));
    const result = await createAudiobookshelfClient(connection, fetch).createPodcast({
      libraryId: "lib-pods",
      folderId: "fol1",
      path: "/podcasts/La Poudre",
      metadata: { title: "La Poudre", feedUrl: "https://feeds.example.com/x.xml" },
      autoDownloadEpisodes: true,
    });
    expect(result).toEqual({ ok: true, value: { itemId: "li_new" } });
    expect(calls[0]?.url.pathname).toBe("/api/podcasts");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(jsonBody(calls[0]?.init)).toEqual({
      libraryId: "lib-pods",
      folderId: "fol1",
      path: "/podcasts/La Poudre",
      media: {
        metadata: { title: "La Poudre", feedUrl: "https://feeds.example.com/x.xml" },
        autoDownloadEpisodes: true,
      },
    });
  });

  it("recognizes a podcast that already exists", async () => {
    const { fetch } = fakeFetch(() => new Response("Podcast already exists", { status: 400 }));
    expect(
      await createAudiobookshelfClient(connection, fetch).createPodcast({
        libraryId: "l",
        folderId: "f",
        path: "/p/x",
        metadata: { title: "x", feedUrl: "https://x" },
        autoDownloadEpisodes: true,
      }),
    ).toMatchObject({ ok: false, error: { kind: "rejected", message: "Podcast already exists" } });
  });

  it("reports a bad key as auth_failed", async () => {
    const { fetch } = fakeFetch(() => new Response("Unauthorized", { status: 401 }));
    expect(await createAudiobookshelfClient(connection, fetch).libraries()).toMatchObject({
      ok: false,
      error: { kind: "auth_failed" },
    });
  });
});

describe("sanitizeFilename", () => {
  it.each([
    ["La Poudre", "La Poudre"],
    ["Rendez-vous: le podcast", "Rendez-vous -  le podcast".replace(/\s+/g, " ")],
    ['Quoi? <Pourquoi> "ça"', "Quoi Pourquoi ça"],
    ["Fin...", "Fin"],
    ["  Espaces   multiples  ", "Espaces multiples"],
  ])("%s → %s", (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });
});
