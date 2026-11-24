import { describe, expect, it } from "vitest";

import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import { createJellyfinClient } from "./client";

const connection = { url: "http://jellyfin:8096/", apiKey: "api-key" };

describe("Jellyfin client", () => {
  it("keeps book libraries and reads their books and audiobooks", async () => {
    const { fetch, calls } = fakeFetch((url) => {
      if (url.pathname === "/Library/VirtualFolders")
        return json([
          { Name: "Books", ItemId: "lib-books", CollectionType: "books" },
          { Name: "Movies", ItemId: "lib-movies", CollectionType: "movies" },
        ]);
      if (url.pathname === "/Items")
        return json({
          Items: [
            {
              Id: "a1",
              Name: "Chapitre 1",
              Type: "AudioBook",
              Album: "Dune",
              AlbumArtist: "Frank Herbert",
            },
            { Id: "b1", Name: "L'Étranger", Type: "Book" },
          ],
          TotalRecordCount: 2,
        });
      return json({}, 404);
    });
    const jellyfin = createJellyfinClient(connection, fetch);

    const libraries = await jellyfin.libraries();
    expect(libraries).toEqual({ ok: true, value: [{ id: "lib-books", name: "Books" }] });
    expect(await jellyfin.allItems(["lib-books"])).toEqual({
      ok: true,
      value: [
        {
          itemId: "a1",
          libraryId: "lib-books",
          format: "audiobook",
          titles: ["Dune", "Chapitre 1"],
          author: "Frank Herbert",
        },
        {
          itemId: "b1",
          libraryId: "lib-books",
          format: "ebook",
          titles: ["L'Étranger"],
          author: "",
        },
      ],
    });
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toContain('Token="api-key"');
    expect(calls[1]?.url.searchParams.get("IncludeItemTypes")).toBe("AudioBook,Book");
  });

  it("checks a user's credentials, then ends the session it opened", async () => {
    const { fetch, calls } = fakeFetch((url, init) => {
      if (url.pathname === "/Users/AuthenticateByName") {
        const body = jsonBody(init);
        const password = body && typeof body === "object" && "Pw" in body ? body.Pw : null;
        return password === "secret"
          ? json({ User: { Id: "u1", Name: "Ann" }, AccessToken: "session-token" })
          : json({}, 401);
      }
      return new Response(null, { status: 204 });
    });
    const jellyfin = createJellyfinClient(connection, fetch);

    expect(await jellyfin.login("ann", "secret")).toEqual({
      ok: true,
      value: { Id: "u1", Name: "Ann" },
    });
    expect(calls[1]?.url.pathname).toBe("/Sessions/Logout");
    expect(new Headers(calls[1]?.init?.headers).get("Authorization")).toContain(
      'Token="session-token"',
    );
    expect(await jellyfin.login("ann", "wrong")).toMatchObject({
      ok: false,
      error: { kind: "auth_failed" },
    });
  });
});
