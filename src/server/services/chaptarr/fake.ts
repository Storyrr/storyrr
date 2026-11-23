import * as v from "valibot";

import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import { AuthorSchema, type Author, type Book } from "./schemas";

/* Test helper: a fake Chaptarr API. */

export const book = (id: number, mediaType: string, asin = "", files = 0): Book => ({
  id,
  title: "Dune",
  mediaType,
  asin,
  audibleASIN: asin,
  statistics: { bookFileCount: files },
});

/** Just enough of Chaptarr's API for the handoff (UNVERIFIED shapes, after Stackarr's fakes). */
export function fakeChaptarr({ authors = [] as Author[], booksAfterRefresh = 1 } = {}) {
  const books: Record<number, Book[]> = {};
  let bookListings = 0;
  const fake = fakeFetch(async (url, init) => {
    const method = init?.method ?? "GET";
    const path = url.pathname;
    const body = jsonBody(init);
    if (method === "GET" && path === "/api/v1/book/lookup") {
      return json([
        {
          title: "Dune",
          foreignBookId: "fb1",
          author: { authorName: "Frank Herbert", foreignAuthorId: "fa1" },
        },
      ]);
    }
    if (method === "GET" && path === "/api/v1/author") return json(authors);
    if (method === "POST" && path === "/api/v1/author") {
      const created = { ...v.parse(AuthorSchema, body), id: 100 };
      authors.push(created);
      books[100] = [book(10, "audiobook", "B07Q44JYLF"), book(11, "ebook")];
      return json(created, 201);
    }
    const put = /^\/api\/v1\/author\/(\d+)$/.exec(path);
    if (method === "PUT" && put) return json(body, 202);
    if (method === "GET" && path === "/api/v1/book") {
      bookListings++;
      const id = Number(url.searchParams.get("authorId"));
      return json(bookListings < booksAfterRefresh ? [] : (books[id] ?? []));
    }
    if (method === "PUT" && path === "/api/v1/book/monitor") return json([], 202);
    if (method === "POST" && path === "/api/v1/command") return json({ id: 1 }, 201);
    return json({ message: "not found" }, 404);
  });
  const calls = (method: string, path: string) =>
    fake.calls.filter((c) => (c.init?.method ?? "GET") === method && c.url.pathname === path);
  return { ...fake, books, calls };
}
