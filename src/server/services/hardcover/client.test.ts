import { describe, expect, it } from "vitest";

import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import { createHardcoverClient } from "./client";
import book from "./fixtures/book.json" with { type: "json" };
import search from "./fixtures/search.json" with { type: "json" };

// Fixtures are hand-written from the field lists in hardcoverapp/hardcover-docs (no recorded response yet).

const tag = (name: string, count: number, spoilerRatio = 0) => ({
  tag: name,
  tagSlug: name.toLowerCase().replaceAll(" ", "-"),
  count,
  spoilerRatio,
});

describe("Hardcover client", () => {
  it("searches books with the token and normalizes hits", async () => {
    const { fetch, calls } = fakeFetch(() => json(search));
    const result = await createHardcoverClient({ token: "abc", fetch }).search("dune");

    expect(calls[0]?.url.href).toBe("https://api.hardcover.app/v1/graphql");
    expect(calls[0]?.init?.headers).toMatchObject({ authorization: "Bearer abc" });
    expect(jsonBody(calls[0]?.init)).toMatchObject({ variables: { query: "dune", perPage: 20 } });
    expect(result.ok && result.value).toEqual([
      {
        type: "ebook",
        source: "hardcover",
        externalId: "312460",
        title: "Dune",
        subtitle: undefined,
        authors: ["Frank Herbert"],
        narrators: [],
        releaseDate: "1965",
        series: [{ name: "Dune", position: "1" }],
        coverUrl: "https://assets.hardcover.app/edition/30408655/cover.jpg",
      },
      expect.objectContaining({ externalId: "435109", series: [], coverUrl: undefined }),
    ]);
  });

  it("adds each result's edition languages with one more query", async () => {
    const { fetch, calls } = fakeFetch((_url, init) =>
      String(jsonBody(init) && JSON.stringify(jsonBody(init))).includes("StoryrrLanguages")
        ? json({
            data: {
              books: [
                {
                  id: 312460,
                  editions: [{ language: { code3: "eng" } }, { language: { code3: "fre" } }],
                },
                { id: 435109, editions: [{ language: null }] },
              ],
            },
          })
        : json(search),
    );
    const result = await createHardcoverClient({ token: "abc", fetch }).search("dune");
    expect(calls).toHaveLength(2);
    expect(jsonBody(calls[1]?.init)).toMatchObject({ variables: { ids: [312460, 435109] } });
    expect(result.ok && result.value.map((item) => item.languages)).toEqual([
      ["eng", "fra"],
      [null],
    ]);
  });

  it("keeps a token pasted with its Bearer prefix", async () => {
    const { fetch, calls } = fakeFetch(() => json(search));
    await createHardcoverClient({ token: "Bearer abc", fetch }).search("dune");
    expect(calls[0]?.init?.headers).toMatchObject({ authorization: "Bearer abc" });
  });

  it("gets a book's details by id", async () => {
    const { fetch, calls } = fakeFetch(() => json(book));
    const result = await createHardcoverClient({ token: "abc", fetch }).getById("312460");
    expect(jsonBody(calls[0]?.init)).toMatchObject({ variables: { id: 312460 } });
    expect(result.ok && result.value).toMatchObject({
      title: "Dune",
      authors: ["Frank Herbert"],
      series: [{ name: "Dune", position: "1" }],
      pages: 617,
      language: "English",
      publisher: "Ace",
      description: "Set on the desert planet Arrakis, Dune is the story of Paul Atreides.",
    });
  });

  it("shows a book's top genres and moods, without readers' opinions or spoilers", async () => {
    const { fetch } = fakeFetch(() =>
      json({
        data: {
          books_by_pk: {
            id: 1,
            title: "Dune",
            cached_tags: {
              Genre: [tag("Fantasy", 5), tag("Science Fiction", 9), tag("Twist", 9, 0.8)],
              Mood: [tag("Adventurous", 3)],
              Tag: [tag("Loveable Characters", 50)],
            },
          },
        },
      }),
    );
    const result = await createHardcoverClient({ token: "abc", fetch }).getById("1");
    expect(result.ok && result.value.tags).toEqual([
      { id: "science-fiction", name: "Science Fiction" },
      { id: "fantasy", name: "Fantasy" },
      { id: "adventurous", name: "Adventurous" },
    ]);
  });

  it("pages through a tag's books, the most read first", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({ data: { tags: [{ tag: "Space Opera" }], books: [{ id: 7, title: "Hyperion" }] } }),
    );
    const result = await createHardcoverClient({ token: "abc", fetch }).tag("space-opera", 2);
    expect(result).toMatchObject({
      ok: true,
      value: { name: "Space Opera", items: [{ externalId: "7", title: "Hyperion" }] },
    });
    expect(jsonBody(calls[0]?.init)).toMatchObject({
      variables: { slug: "space-opera", limit: 40, offset: 40 },
    });
  });

  it("reports unknown and malformed ids as not found", async () => {
    const { fetch } = fakeFetch(() => json({ data: { books_by_pk: null } }));
    const client = createHardcoverClient({ token: "abc", fetch });
    expect(await client.getById("999")).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(await client.getById("abc")).toMatchObject({ ok: false, error: { kind: "not_found" } });
  });

  it("surfaces GraphQL errors and an expired token", async () => {
    const errors = fakeFetch(() => json({ errors: [{ message: "field 'search' not found" }] }));
    expect(
      await createHardcoverClient({ token: "abc", fetch: errors.fetch }).search("x"),
    ).toMatchObject({
      ok: false,
      error: { kind: "rejected", message: "field 'search' not found" },
    });
    const expired = fakeFetch(() => json({ error: "invalid_token" }, 401));
    expect(
      await createHardcoverClient({ token: "abc", fetch: expired.fetch }).search("x"),
    ).toMatchObject({
      ok: false,
      error: { kind: "auth_failed" },
    });
  });
});

describe("Hardcover trending", () => {
  it("looks up the trending ids and keeps their rank order", async () => {
    const { fetch, calls } = fakeFetch((_url, init) => {
      const body = JSON.stringify(jsonBody(init));
      if (body.includes("StoryrrTrending"))
        return json({ data: { books_trending: { ids: [2, 1], error: null } } });
      return json({
        data: {
          books: [
            { id: 1, title: "One", contributions: [], editions: [{ language: { code3: "fre" } }] },
            { id: 2, title: "Two", contributions: [{ author: { name: "A" } }], editions: [] },
          ],
        },
      });
    });
    const result = await createHardcoverClient({ token: "abc", fetch }).trending({ limit: 2 });
    expect(calls).toHaveLength(2);
    expect(result.ok && result.value.map((b) => [b.externalId, b.title, b.languages])).toEqual([
      ["2", "Two", []],
      ["1", "One", ["fra"]],
    ]);
  });
});
