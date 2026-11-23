import { describe, expect, it } from "vitest";

import { fakeFetch, json } from "#/server/services/test-utils";

import { htmlToText } from "#/server/services/text";

import { createAudibleClient } from "./client";
import notFound from "./fixtures/product-not-found.json" with { type: "json" };
import product from "./fixtures/product-B07Q44JYLF.fr.json" with { type: "json" };
import search from "./fixtures/search-dune.fr.json" with { type: "json" };

describe("Audible client", () => {
  it("searches the region's catalog and normalizes results", async () => {
    const { fetch, calls } = fakeFetch(() => json(search));
    const result = await createAudibleClient({ fetch, region: "fr" }).search("dune");

    expect(calls[0]?.url.host).toBe("api.audible.fr");
    expect(calls[0]?.url.searchParams.get("keywords")).toBe("dune");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0]).toEqual({
      type: "audiobook",
      source: "audible",
      externalId: "B07Q44JYLF",
      title: "Dune - Livre premier et livre second",
      subtitle: "Dune 1",
      // The translator ("Michel Demuth - traducteur") is not an author.
      authors: ["Frank Herbert"],
      narrators: ["Benjamin Jungers"],
      publisher: "Lizzie",
      releaseDate: "2019-04-11",
      series: [{ name: "Dune", position: "1.1" }],
      coverUrl: "https://m.media-amazon.com/images/I/41ZARrCWHRL._SL500_.jpg",
      language: "french",
      languages: ["fra"],
      durationMinutes: 1080,
    });
  });

  it("gets details by ASIN with a plain-text description", async () => {
    const { fetch, calls } = fakeFetch(() => json(product));
    const result = await createAudibleClient({ fetch, region: "us" }).getByAsin("B07Q44JYLF");

    expect(calls[0]?.url.href).toMatch(
      /^https:\/\/api\.audible\.com\/1\.0\/catalog\/products\/B07Q44JYLF\?/,
    );
    expect(result.ok && result.value.description).toMatch(/^Le livre culte/);
    expect(result.ok && result.value.description).not.toContain("<");
  });

  it("reports unknown ASINs as not found", async () => {
    const { fetch } = fakeFetch(() => json(notFound));
    const result = await createAudibleClient({ fetch, region: "fr" }).getByAsin("B000000000");
    expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
  });

  it("maps network failures and server errors to retryable", async () => {
    const down = fakeFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(
      await createAudibleClient({ fetch: down.fetch, region: "fr" }).search("x"),
    ).toMatchObject({
      ok: false,
      error: { kind: "retryable" },
    });
    const busy = fakeFetch(() => new Response("busy", { status: 503 }));
    expect(
      await createAudibleClient({ fetch: busy.fetch, region: "fr" }).search("x"),
    ).toMatchObject({
      ok: false,
      error: { kind: "retryable", status: 503 },
    });
  });

  it("rejects responses that don't match the expected shape", async () => {
    const { fetch } = fakeFetch(() => json({ unexpected: true }));
    expect(await createAudibleClient({ fetch, region: "fr" }).search("x")).toMatchObject({
      ok: false,
      error: { kind: "rejected" },
    });
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs and decodes entities", () => {
    expect(htmlToText("<p><b>Hello</b> &amp; welcome</p> <p>Line<br/>break</p>")).toBe(
      "Hello & welcome\n\nLine\nbreak",
    );
  });
});
