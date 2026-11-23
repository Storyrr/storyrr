import { describe, expect, it } from "vitest";

import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import { createHardcoverClient } from "./client";
import book from "./fixtures/book.json" with { type: "json" };
import search from "./fixtures/search.json" with { type: "json" };

// Fixtures are hand-written from the field lists in hardcoverapp/hardcover-docs (no recorded response yet).

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
