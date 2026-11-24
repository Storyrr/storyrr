import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cachedImage, imageCacheStats, isAllowedImageUrl } from "./network";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("image cache", () => {
  it("only proxies the providers' image hosts over https", () => {
    expect(isAllowedImageUrl("https://m.media-amazon.com/images/I/x.jpg")).not.toBeNull();
    expect(isAllowedImageUrl("http://m.media-amazon.com/images/I/x.jpg")).toBeNull();
    expect(isAllowedImageUrl("https://chaptarr:8789/api/v1/rootfolder")).toBeNull();
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
