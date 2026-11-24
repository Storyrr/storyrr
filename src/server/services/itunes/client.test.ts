import { describe, expect, it } from "vitest";

import { fakeFetch, json } from "#/server/services/test-utils";

import { createItunesClient } from "./client";
import lookup from "./fixtures/lookup.json" with { type: "json" };
import search from "./fixtures/search-fr.json" with { type: "json" };

describe("iTunes client", () => {
  it("searches podcasts in the configured store", async () => {
    const { fetch, calls } = fakeFetch(() => json(search));
    const result = await createItunesClient({ fetch, country: "fr" }).search("la poudre");

    expect(calls[0]?.url.searchParams.get("media")).toBe("podcast");
    expect(calls[0]?.url.searchParams.get("country")).toBe("fr");
    expect(result.ok && result.value[0]).toEqual({
      type: "podcast",
      source: "itunes",
      externalId: "1172772210",
      title: "La Poudre",
      authors: ["Lauren Bastide"],
      narrators: [],
      series: [],
      releaseDate: "2026-10-23",
      coverUrl: expect.stringContaining("600x600bb.jpg"),
      feedUrl: "https://feeds.audiomeans.fr/feed/f421f90d-cee9-47c4-9105-bca8e46fe952.xml",
      episodeCount: 230,
      genres: ["Culture et société"],
    });
  });

  it("looks a podcast up by id, and reports unknown ids as not found", async () => {
    const found = fakeFetch(() => json(lookup));
    expect(
      await createItunesClient({ fetch: found.fetch, country: "fr" }).getById("1172772210"),
    ).toMatchObject({
      ok: true,
      value: { title: "La Poudre" },
    });
    const missing = fakeFetch(() => json({ resultCount: 0, results: [] }));
    expect(
      await createItunesClient({ fetch: missing.fetch, country: "fr" }).getById("1"),
    ).toMatchObject({
      ok: false,
      error: { kind: "not_found" },
    });
  });
});
