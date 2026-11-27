import { describe, expect, it } from "vitest";

import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import { createKavitaClient } from "./client";

const connection = { url: "http://kavita:5000/", apiKey: "auth-key" };

const series = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  localizedName: null,
  originalName: name,
  libraryId: 1,
  ...extra,
});

describe("Kavita client", () => {
  it("trades the Auth Key for a JWT once and pages through every series", async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => series(i, `Series ${i}`));
    const { fetch, calls } = fakeFetch((url) => {
      if (url.pathname === "/api/Plugin/authenticate")
        return json({ username: "admin", token: "jwt-1" });
      if (url.pathname === "/api/Series/all-v2") {
        return json(
          url.searchParams.get("PageNumber") === "1"
            ? page1
            : [series(999, "Berserk", { localizedName: "ベルセルク" })],
        );
      }
      if (url.pathname === "/api/Library/libraries")
        return json([{ id: 1, name: "Manga", type: 0 }]);
      return json({}, 404);
    });

    const result = await createKavitaClient(connection, fetch).allSeries();

    expect(result.ok && result.value).toHaveLength(501);
    expect(result.ok && result.value.at(-1)).toEqual({
      seriesId: 999,
      libraryId: 1,
      names: ["Berserk", "ベルセルク"],
      paths: [],
      books: [],
    });
    const auth = calls.filter((c) => c.url.pathname === "/api/Plugin/authenticate");
    expect(auth).toHaveLength(1);
    expect(auth[0]?.url.searchParams.get("apiKey")).toBe("auth-key");
    expect(auth[0]?.url.searchParams.get("pluginName")).toBe("Storyrr");
    const list = calls.find((c) => c.url.pathname === "/api/Series/all-v2");
    expect(list?.init?.headers).toMatchObject({ Authorization: "Bearer jwt-1" });
    expect(jsonBody(list?.init)).toEqual({ statements: [], combination: 1, limitTo: 0 });
  });

  it("adds the books' titles of a series in a book library", async () => {
    // Recorded shapes (Kavita 0.9.1, trimmed): two EPUBs grouped by their metadata's collection.
    const { fetch, calls } = fakeFetch((url) => {
      if (url.pathname === "/api/Plugin/authenticate") return json({ token: "jwt" });
      if (url.pathname === "/api/Series/all-v2")
        return json([
          series(2, "The Guardian's 100 Greatest Novels", { libraryId: 1 }),
          series(7, "Berserk", { libraryId: 2 }),
        ]);
      if (url.pathname === "/api/Library/libraries")
        return json([
          { id: 1, name: "Books", type: 2 },
          { id: 2, name: "Manga", type: 0 },
        ]);
      if (url.pathname === "/api/Series/volumes")
        return json([
          {
            id: 3,
            minNumber: 9,
            name: "9",
            chapters: [
              {
                range: "-100000",
                titleName: "Frankenstein",
                files: [{ filePath: "/ebooks/Frankenstein/Frankenstein.epub" }],
              },
              { range: "-100000", titleName: "Alice's Adventures in Wonderland" },
            ],
          },
        ]);
      return json({}, 404);
    });

    const result = await createKavitaClient(connection, fetch).allSeries();

    expect(result.ok && result.value).toEqual([
      {
        seriesId: 2,
        libraryId: 1,
        names: [
          "The Guardian's 100 Greatest Novels",
          "Frankenstein",
          "Alice's Adventures in Wonderland",
        ],
        paths: ["/ebooks/Frankenstein/Frankenstein.epub"],
        books: [
          {
            volumeId: 3,
            titles: ["Frankenstein", "Alice's Adventures in Wonderland"],
            paths: ["/ebooks/Frankenstein/Frankenstein.epub"],
          },
        ],
      },
      { seriesId: 7, libraryId: 2, names: ["Berserk"], paths: [], books: [] },
    ]);
    const volumes = calls.filter((c) => c.url.pathname === "/api/Series/volumes");
    expect(volumes.map((c) => c.url.searchParams.get("seriesId"))).toEqual(["2"]);
  });

  it("re-authenticates once when the JWT expired", async () => {
    let tokens = 0;
    const { fetch } = fakeFetch((url, init) => {
      if (url.pathname === "/api/Plugin/authenticate") return json({ token: `jwt-${++tokens}` });
      const headers = new Headers(init?.headers);
      return headers.get("Authorization") === "Bearer jwt-2"
        ? json([{ id: 1, name: "Books", type: 2 }])
        : json({}, 401);
    });
    expect(await createKavitaClient(connection, fetch).libraries()).toEqual({
      ok: true,
      value: [{ id: 1, name: "Books", type: 2 }],
    });
  });

  it("reports a wrong Auth Key as auth_failed without looping", async () => {
    const { fetch, calls } = fakeFetch(() => json({}, 401));
    expect(await createKavitaClient(connection, fetch).libraries()).toMatchObject({
      ok: false,
      error: { kind: "auth_failed" },
    });
    expect(calls).toHaveLength(1);
  });
});
