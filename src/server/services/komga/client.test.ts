import { describe, expect, it } from "vitest";

import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import { createKomgaClient } from "./client";

const connection = { url: "http://komga:25600/", apiKey: "api-key" };

const series = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  libraryId: "lib-1",
  name: title,
  deleted: false,
  metadata: { title, alternateTitles: [] },
  booksMetadata: { authors: [{ name: "Kentaro Miura", role: "writer" }] },
  ...extra,
});

describe("Komga client", () => {
  it("pages through every series with the API key, keeping alternate titles", async () => {
    const page0 = Array.from({ length: 500 }, (_, i) => series(`s${i}`, `Series ${i}`));
    const { fetch, calls } = fakeFetch((url) => {
      if (url.pathname === "/api/v1/books/list") return json({ content: [], last: true });
      if (url.pathname !== "/api/v1/series/list") return json({}, 404);
      return url.searchParams.get("page") === "0"
        ? json({ content: page0, last: false })
        : json({
            content: [
              series("b", "Berserk", {
                metadata: {
                  title: "Berserk",
                  alternateTitles: [{ label: "ja", title: "ベルセルク" }],
                },
              }),
              series("gone", "Deleted", { deleted: true }),
            ],
            last: true,
          });
    });

    const result = await createKomgaClient(connection, fetch).allSeries();

    expect(result.ok && result.value).toHaveLength(501);
    expect(result.ok && result.value.at(-1)).toEqual({
      seriesId: "b",
      libraryId: "lib-1",
      names: ["Berserk", "ベルセルク"],
      author: "Kentaro Miura",
    });
    expect(calls.filter((c) => c.url.pathname === "/api/v1/series/list")).toHaveLength(2);
    expect(calls[0]?.init?.headers).toMatchObject({ "X-API-Key": "api-key" });
    expect(jsonBody(calls[0]?.init)).toEqual({});
  });

  it("adds the titles of a series' books, but not bare volume numbers", async () => {
    // Recorded shapes (Komga 1.30.2, trimmed): two EPUBs in one series.
    const { fetch } = fakeFetch((url) => {
      if (url.pathname === "/api/v1/series/list")
        return json({ content: [series("s1", "Le Monde's 100 Books of the Century")], last: true });
      if (url.pathname === "/api/v1/books/list")
        return json({
          content: [
            { seriesId: "s1", deleted: false, metadata: { title: "The War of the Worlds" } },
            { seriesId: "s1", deleted: false, metadata: { title: "The Time Machine" } },
            { seriesId: "s1", deleted: false, metadata: { title: "01" } },
            { seriesId: "s1", deleted: true, metadata: { title: "Removed" } },
          ],
          last: true,
        });
      return json({}, 404);
    });

    const result = await createKomgaClient(connection, fetch).allSeries();

    expect(result.ok && result.value[0]?.names).toEqual([
      "Le Monde's 100 Books of the Century",
      "The War of the Worlds",
      "The Time Machine",
    ]);
  });

  it("checks a user's email and password with HTTP Basic auth", async () => {
    const { fetch, calls } = fakeFetch((url, init) => {
      const header = new Headers(init?.headers).get("Authorization");
      return url.pathname === "/api/v2/users/me" &&
        header === `Basic ${Buffer.from("ann@example.com:secret").toString("base64")}`
        ? json({ id: "u1", email: "ann@example.com", roles: ["USER"] })
        : json({}, 401);
    });
    const komga = createKomgaClient(connection, fetch);

    expect(await komga.login("ann@example.com", "secret")).toMatchObject({
      ok: true,
      value: { id: "u1", email: "ann@example.com" },
    });
    expect(await komga.login("ann@example.com", "wrong")).toMatchObject({
      ok: false,
      error: { kind: "auth_failed" },
    });
    expect(calls[0]?.init?.headers).not.toHaveProperty("X-API-Key");
  });
});
