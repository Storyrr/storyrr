import { describe, expect, it } from "vitest";

import { fakeFetch, json } from "#/server/services/test-utils";

import { htmlToText } from "#/server/services/text";

import { createAudibleClient } from "./client";
import notFound from "./fixtures/product-not-found.json" with { type: "json" };
import product from "./fixtures/product-B07Q44JYLF.fr.json" with { type: "json" };
import search from "./fixtures/search-dune.fr.json" with { type: "json" };

const node = (id: string, name: string) => ({ id, name });

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
      authorRefs: [{ id: "B000APO5OM", name: "Frank Herbert" }],
      narrators: ["Benjamin Jungers"],
      publisher: "Lizzie",
      releaseDate: "2019-04-11",
      series: [{ name: "Dune", position: "1.1", id: "B07R989K55" }],
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

  it("lists a title's genres once each, and browses a genre's bestsellers", async () => {
    const { fetch, calls } = fakeFetch((url) => {
      if (url.pathname.endsWith("/categories/3"))
        return json({ category: node("3", "Space opera") });
      if (url.searchParams.has("category_id"))
        return json({ products: product.product ? [product.product] : [] });
      return json({
        product: {
          ...product.product,
          category_ladders: [
            { ladder: [node("1", "Science fiction"), node("2", "Adventure")] },
            { ladder: [node("1", "Science fiction"), node("3", "Space opera")] },
          ],
        },
      });
    });
    const audible = createAudibleClient({ fetch, region: "fr" });

    const details = await audible.getByAsin("B07Q44JYLF");
    expect(details.ok && details.value.tags).toEqual([
      node("1", "Science fiction"),
      node("2", "Adventure"),
      node("3", "Space opera"),
    ]);
    expect(calls[0]?.url.searchParams.get("response_groups")).toContain("category_ladders");

    const genre = await audible.category("3", 2);
    expect(genre).toMatchObject({
      ok: true,
      value: { name: "Space opera", items: [{ externalId: "B07Q44JYLF" }] },
    });
    expect(calls.at(-1)?.url.searchParams.get("page")).toBe("1");
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

describe("Audible bestsellers", () => {
  it("lists the region's catalog by bestsellers, without keywords", async () => {
    const { fetch, calls } = fakeFetch(() => json(search));
    const result = await createAudibleClient({ fetch, region: "fr" }).bestsellers({ limit: 10 });
    expect(calls[0]?.url.searchParams.get("products_sort_by")).toBe("BestSellers");
    expect(calls[0]?.url.searchParams.has("keywords")).toBe(false);
    expect(result.ok && result.value).toHaveLength(2);
  });

  it("lists a series' volumes in reading order", async () => {
    const { fetch, calls } = fakeFetch((url) => {
      if (url.pathname.endsWith("/B07R989K55"))
        return json({
          product: {
            asin: "B07R989K55",
            title: "Dune",
            relationships: [
              {
                asin: "B000000002",
                relationship_to_product: "child",
                relationship_type: "series",
                sort: "2",
              },
              {
                asin: "B000000001",
                relationship_to_product: "child",
                relationship_type: "series",
                sort: "1",
              },
              {
                asin: "B000000009",
                relationship_to_product: "parent",
                relationship_type: "series",
              },
            ],
          },
        });
      return json({
        products: [
          { asin: "B000000002", title: "Dune Messiah" },
          { asin: "B000000001", title: "Dune" },
        ],
      });
    });
    const result = await createAudibleClient({ fetch, region: "fr" }).series("B07R989K55");

    expect(result.ok && result.value.items.map((i) => i.title)).toEqual(["Dune", "Dune Messiah"]);
    expect(calls[1]?.url.searchParams.get("asins")).toBe("B000000001,B000000002");
  });
});
