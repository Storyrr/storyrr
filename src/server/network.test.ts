import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cachedImage, imageCacheStats, isAllowedImageUrl } from "./network";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const answer =
  (response: () => Response): typeof globalThis.fetch =>
  async () =>
    response();

describe("image cache", () => {
  it("only proxies the providers' image hosts over https", () => {
    expect(isAllowedImageUrl("https://m.media-amazon.com/images/I/x.jpg")).not.toBeNull();
    expect(isAllowedImageUrl("http://m.media-amazon.com/images/I/x.jpg")).toBeNull();
    expect(isAllowedImageUrl("https://chaptarr:8789/api/v1/rootfolder")).toBeNull();
    expect(isAllowedImageUrl("https://m.media-amazon.com:8443/x.jpg")).toBeNull();
    // Queries can't make new cache entries.
    expect(isAllowedImageUrl("https://m.media-amazon.com/x.jpg?v=1#a")?.href).toBe(
      "https://m.media-amazon.com/x.jpg",
    );
  });

  it("refuses SVG, oversized bodies and redirects off the image hosts", async () => {
    dir = await mkdtemp(join(tmpdir(), "storyrr-images-"));
    const url = new URL("https://assets.hardcover.app/cover.jpg");
    const svg = answer(
      () => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }),
    );
    expect(await cachedImage(dir, url, svg)).toBeNull();

    const huge = answer(
      () =>
        new Response(new Uint8Array(6 * 1024 * 1024), {
          headers: { "content-type": "image/png" },
        }),
    );
    expect(await cachedImage(dir, url, huge)).toBeNull();

    const offHost = answer(
      () => new Response(null, { status: 302, headers: { location: "https://chaptarr/x" } }),
    );
    expect(await cachedImage(dir, url, offHost)).toBeNull();

    const seen: string[] = [];
    const onHost: typeof globalThis.fetch = async (input) => {
      seen.push(input instanceof Request ? input.url : input.toString());
      return seen.length === 1
        ? new Response(null, { status: 301, headers: { location: "/moved.jpg" } })
        : new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } });
    };
    expect((await cachedImage(dir, url, onHost))?.type).toBe("image/jpeg");
    expect(seen).toEqual([url.href, "https://assets.hardcover.app/moved.jpg"]);
  });

  it("fetches once, then serves from disk", async () => {
    dir = await mkdtemp(join(tmpdir(), "storyrr-images-"));
    let calls = 0;
    const fetch: typeof globalThis.fetch = async () => {
      calls++;
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    };
    const url = new URL("https://assets.hardcover.app/cover.jpg");
    expect((await cachedImage(dir, url, fetch))?.type).toBe("image/jpeg");
    expect((await cachedImage(dir, url, fetch))?.body.length).toBe(3);
    expect(calls).toBe(1);
    expect(await imageCacheStats(dir)).toEqual({ files: 1, bytes: 3 });
  });
});
