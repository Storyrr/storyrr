import { describe, expect, it } from "vitest";

import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import { createHardcoverClient, exploreQuery, seriesBaseName } from "./client";
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

  it("adds each result's edition languages and series id with one more query", async () => {
    const { fetch, calls } = fakeFetch((_url, init) =>
      String(jsonBody(init) && JSON.stringify(jsonBody(init))).includes("StoryrrLanguages")
        ? json({
            data: {
              books: [
                {
                  id: 312460,
                  editions: [{ language: { code3: "eng" } }, { language: { code3: "fre" } }],
                  featured_book_series: { position: 1, series: { id: 4, name: "Dune" } },
                },
                { id: 435109, editions: [{ language: null }], featured_book_series: null },
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
    expect(result.ok && result.value.map((item) => item.series)).toEqual([
      [{ name: "Dune", position: "1", id: "4" }],
      [],
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

describe("Hardcover explore query", () => {
  const today = new Date("2026-11-24T12:00:00Z");

  it("keeps main books, most read first, with no filter", () => {
    expect(exploreQuery({}, today)).toEqual({
      where: { _and: [{ canonical_id: { _is_null: true } }] },
      order: [{ users_count: "desc" }],
    });
  });

  it("turns filters into conditions and skips placeholder records in other sorts", () => {
    const { where, order } = exploreQuery(
      {
        sort: "newest",
        genres: ["fantasy"],
        yearFrom: 2000,
        pagesMax: 400,
        ratingMin: 4,
        language: "fr",
      },
      today,
    );
    expect(where).toEqual({
      _and: [
        { canonical_id: { _is_null: true } },
        { users_count: { _gte: 5 } },
        { release_date: { _lte: "2026-11-24" } },
        { _or: [{ cached_tags: { _contains: { Genre: [{ tagSlug: "fantasy" }] } } }] },
        { release_year: { _gte: 2000 } },
        { pages: { _lte: 400 } },
        { rating: { _gte: 4 } },
        { editions: { language: { code2: { _eq: "fr" } } } },
      ],
    });
    expect(order).toEqual([{ release_date: "desc_nulls_last" }]);
  });

  it("lists upcoming books within a year, without placeholder titles", () => {
    const { where, order } = exploreQuery({ sort: "upcoming" }, today);
    expect(where).toEqual({
      _and: [
        { canonical_id: { _is_null: true } },
        { release_date: { _gt: "2026-11-24", _lte: "2027-11-24" } },
        { title: { _nilike: "untitled%" } },
      ],
    });
    expect(order).toEqual([{ users_count: "desc" }, { release_date: "asc" }]);
  });
});

describe("Hardcover series", () => {
  const seriesHits = {
    data: {
      search: {
        results: {
          hits: [
            {
              document: {
                id: "225411",
                name: "Solo Leveling (Comic)",
                author_name: "Chugong",
                books_count: 15,
                primary_books_count: 15,
              },
            },
            {
              document: {
                id: "42570",
                name: "Solo Leveling (French Numbering)",
                author_name: "Chugong",
                books_count: 19,
                primary_books_count: 19,
              },
            },
            {
              document: {
                id: "282109",
                name: "Solo Leveling: Ragnarok",
                books_count: 1,
                primary_books_count: 1,
              },
            },
            {
              document: {
                id: "285785",
                name: "Solo Leveling Series",
                books_count: 0,
                primary_books_count: 0,
              },
            },
          ],
        },
      },
    },
  };
  const seriesLanguages = {
    data: {
      series: [
        {
          id: 225411,
          book_series: [
            {
              book: {
                image: { url: "https://example.test/comic-1.jpg" },
                editions: [{ language: { code3: "eng" } }],
              },
            },
            { book: { image: null, editions: [{ language: { code3: "kor" } }] } },
          ],
        },
        {
          id: 42570,
          book_series: [
            {
              book: {
                image: { url: "https://example.test/fr-1.jpg" },
                editions: [{ language: { code3: "fre" } }, { language: null }],
              },
            },
          ],
        },
      ],
    },
  };
  const fetchSeries = () =>
    fakeFetch((_url, init) =>
      JSON.stringify(jsonBody(init)).includes("StoryrrSeriesLanguages")
        ? json(seriesLanguages)
        : json(seriesHits),
    );

  it("strips a series name's trailing qualifiers", () => {
    expect(seriesBaseName("Solo Leveling (French Numbering)")).toBe("Solo Leveling");
    expect(seriesBaseName("Solo Leveling (1-in-2 Comic) [FR]")).toBe("Solo Leveling");
    expect(seriesBaseName("Solo Leveling: Ragnarok")).toBe("Solo Leveling: Ragnarok");
    expect(seriesBaseName("(Untitled)")).toBe("");
  });

  it("searches series with their first books' languages and cover, empty ones left out", async () => {
    const { fetch, calls } = fetchSeries();
    const result = await createHardcoverClient({ token: "abc", fetch }).searchSeries(
      "solo leveling",
    );

    expect(jsonBody(calls[0]?.init)).toMatchObject({
      variables: { query: "solo leveling", perPage: 10 },
    });
    expect(jsonBody(calls[1]?.init)).toMatchObject({ variables: { ids: [225411, 42570, 282109] } });
    expect(result.ok && result.value).toEqual([
      {
        id: "225411",
        name: "Solo Leveling (Comic)",
        author: "Chugong",
        booksCount: 15,
        coverUrl: "https://example.test/comic-1.jpg",
        languages: ["eng", "kor"],
      },
      {
        id: "42570",
        name: "Solo Leveling (French Numbering)",
        author: "Chugong",
        booksCount: 19,
        coverUrl: "https://example.test/fr-1.jpg",
        languages: ["fra", null],
      },
      // Not in the languages answer: no cover, languages unknown.
      {
        id: "282109",
        name: "Solo Leveling: Ragnarok",
        author: undefined,
        booksCount: 1,
        coverUrl: undefined,
        languages: undefined,
      },
    ]);
  });

  it("finds the other series with the same name apart from a qualifier", async () => {
    const { fetch, calls } = fetchSeries();
    const result = await createHardcoverClient({ token: "abc", fetch }).relatedSeries(
      "225411",
      "Solo Leveling (Comic)",
    );

    expect(jsonBody(calls[0]?.init)).toMatchObject({ variables: { query: "Solo Leveling" } });
    expect(result.ok && result.value.map((series) => series.name)).toEqual([
      "Solo Leveling (French Numbering)",
    ]);
  });
});
