import { describe, expect, it } from "vitest";

import { fakeFetch, json } from "#/server/services/test-utils";

import { createAudiobookshelfClient } from "./client";

const connection = { url: "http://audiobookshelf/", apiKey: "abs-key" };

const bookItem = (id: string, asin: string | null) => ({
  id,
  media: { metadata: { title: `Title ${id}`, authorName: "Author", asin } },
});

describe("Audiobookshelf client", () => {
  it("indexes items of book libraries only, across pages, with normalized ASINs", async () => {
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
      return json({}, 404);
    });

    const result = await createAudiobookshelfClient(connection, fetch).allItems();

    expect(result.ok && result.value).toHaveLength(201);
    expect(result.ok && result.value.at(-1)).toEqual({
      itemId: "last",
      libraryId: "lib-books",
      asin: "B07Q44JYLF",
      title: "Title last",
      author: "Author",
    });
    expect(calls.some((c) => c.url.pathname.includes("lib-pods"))).toBe(false);
    expect(calls[0]?.init?.headers).toMatchObject({ Authorization: "Bearer abs-key" });
  });

  it("reports a bad key as auth_failed", async () => {
    const { fetch } = fakeFetch(() => new Response("Unauthorized", { status: 401 }));
    expect(await createAudiobookshelfClient(connection, fetch).libraries()).toMatchObject({
      ok: false,
      error: { kind: "auth_failed" },
    });
  });
});
