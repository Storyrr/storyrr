import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import type { Book } from "./schemas";

/* Test helper: a fake Chaptarr API, shaped after Chaptarr's source (book lookup and import). */

export const book = (id: number, mediaType: string, files = 0): Book => ({
  id,
  title: "Dune",
  foreignBookId: "hc:1",
  mediaType,
  statistics: { bookFileCount: files },
  author: { foreignAuthorId: "hc:10", authorName: "Frank Herbert" },
});

/** A remote lookup result (not in Chaptarr yet): id 0. */
export const remoteBook = (): Book => ({ ...book(0, "audiobook"), statistics: null });

export function fakeChaptarr({
  lookup = [remoteBook()],
  importResponse = { status: 201, body: { id: 42 } },
  metadataProfiles = [] as { id: number; name: string; allowedLanguages?: string }[],
}: {
  lookup?: Book[];
  importResponse?: { status: number; body: unknown };
  metadataProfiles?: { id: number; name: string; allowedLanguages?: string }[];
} = {}) {
  const state = { lookup, importResponse, metadataProfiles };
  const fake = fakeFetch((url, init) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && url.pathname === "/api/v1/book/lookup") {
      const media = url.searchParams.get("mediaType");
      return json(state.lookup.filter((b) => !media || b.mediaType === media));
    }
    if (method === "GET" && url.pathname === "/api/v1/metadataprofile") {
      return json(state.metadataProfiles);
    }
    if (method === "POST" && url.pathname === "/api/v1/book/import") {
      return json(state.importResponse.body, state.importResponse.status);
    }
    return json({ message: "not found" }, 404);
  });
  const calls = (method: string, path: string) =>
    fake.calls.filter((c) => (c.init?.method ?? "GET") === method && c.url.pathname === path);
  const bodyOf = (method: string, path: string) => jsonBody(calls(method, path)[0]?.init);
  return { ...fake, state, calls, bodyOf };
}
