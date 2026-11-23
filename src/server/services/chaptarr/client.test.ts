import { describe, expect, it } from "vitest";

import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import {
  createChaptarrClient,
  hasBookFile,
  matchBook,
  submitBook,
  type SubmitBookInput,
} from "./client";
import { book, fakeChaptarr } from "./fake";

const connection = { url: "http://chaptarr:8789/", apiKey: "test-key" };
const input: SubmitBookInput = {
  asin: "B07Q44JYLF",
  title: "Dune",
  media: "audiobook",
  rootFolderPath: "/audiobooks",
  qualityProfileId: 1,
  metadataProfileId: 2,
};

const bodyOf = (call: { init: RequestInit | undefined } | undefined) => jsonBody(call?.init);

const noSleep = () => Promise.resolve();

describe("submitBook", () => {
  it("adds the author for this media only and searches just the requested book", async () => {
    const chaptarr = fakeChaptarr({ booksAfterRefresh: 2 });
    const client = createChaptarrClient(connection, chaptarr.fetch);
    const result = await submitBook(client, input, { sleep: noSleep });

    expect(result).toEqual({
      ok: true,
      value: { authorId: 100, bookId: 10, authorName: "Frank Herbert" },
    });

    const [add] = chaptarr.calls("POST", "/api/v1/author");
    expect(add?.url.searchParams.get("mediaType")).toBe("audiobook");
    expect(add?.init?.headers).toMatchObject({ "X-Api-Key": "test-key" });
    expect(bodyOf(add)).toMatchObject({
      foreignAuthorId: "fa1",
      audiobookRootFolderPath: "/audiobooks",
      audiobookQualityProfileId: 1,
      audiobookMetadataProfileId: 2,
      audiobookMonitorExisting: 2,
      ebookMonitorExisting: 0,
      addOptions: { monitor: "none", searchForMissingBooks: false },
    });

    // Waited for the async refresh, then touched only book 10.
    expect(chaptarr.calls("GET", "/api/v1/book")).toHaveLength(2);
    expect(bodyOf(chaptarr.calls("PUT", "/api/v1/book/monitor")[0])).toEqual({
      bookIds: [10],
      monitored: true,
    });
    expect(bodyOf(chaptarr.calls("POST", "/api/v1/command")[0])).toEqual({
      name: "BookSearch",
      bookIds: [10],
    });
  });

  it("sets up an author first added for eBooks before monitoring an audiobook", async () => {
    const chaptarr = fakeChaptarr({
      authors: [
        {
          id: 7,
          authorName: "Frank Herbert",
          foreignAuthorId: "fa1",
          monitored: true,
          ebookMonitorExisting: 2,
        },
      ],
    });
    chaptarr.books[7] = [book(70, "ebook"), book(71, "audiobook", "B07Q44JYLF")];
    const result = await submitBook(createChaptarrClient(connection, chaptarr.fetch), input, {
      sleep: noSleep,
    });

    expect(result).toMatchObject({ ok: true, value: { authorId: 7, bookId: 71 } });
    expect(chaptarr.calls("POST", "/api/v1/author")).toHaveLength(0);
    const [update] = chaptarr.calls("PUT", "/api/v1/author/7");
    expect(update?.url.searchParams.get("mediaType")).toBe("audiobook");
    expect(bodyOf(update)).toMatchObject({
      ebookMonitorExisting: 2,
      audiobookMonitorExisting: 2,
      audiobookRootFolderPath: "/audiobooks",
    });
  });

  it("reports a rejected API key as auth_failed", async () => {
    const { fetch } = fakeFetch(() => new Response("Unauthorized", { status: 401 }));
    const result = await submitBook(createChaptarrClient(connection, fetch), input, {
      sleep: noSleep,
    });
    expect(result).toMatchObject({ ok: false, error: { kind: "auth_failed", status: 401 } });
  });

  it("surfaces Chaptarr's validation message when it refuses the author", async () => {
    const chaptarr = fakeFetch((url, init) => {
      if (url.pathname === "/api/v1/book/lookup") {
        return json([{ author: { authorName: "A", foreignAuthorId: "fa1" } }]);
      }
      if (init?.method === "POST") {
        return json(
          [{ errorMessage: "Root folder '/books' is not compatible with audiobook imports" }],
          400,
        );
      }
      return json([]);
    });
    const result = await submitBook(createChaptarrClient(connection, chaptarr.fetch), input, {
      sleep: noSleep,
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: "rejected",
        message: "Root folder '/books' is not compatible with audiobook imports",
      },
    });
  });

  it("gives up when the book never shows up", async () => {
    const chaptarr = fakeChaptarr({ booksAfterRefresh: 99 });
    const result = await submitBook(createChaptarrClient(connection, chaptarr.fetch), input, {
      sleep: noSleep,
      attempts: 3,
    });
    expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(chaptarr.calls("POST", "/api/v1/command")).toHaveLength(0);
  });
});

describe("matchBook", () => {
  it("picks the requested media's row", () => {
    const rows = [book(1, "ebook", "B0X"), book(2, "audiobook", "B0X")];
    expect(matchBook(rows, { asin: "b0x", title: "", media: "audiobook" })?.id).toBe(2);
  });

  it("falls back to the exact title", () => {
    expect(
      matchBook([book(3, "audiobook")], { asin: "B0NONE", title: "dune!", media: "audiobook" })?.id,
    ).toBe(3);
  });
});

describe("hasBookFile", () => {
  it("reads the book's file count", async () => {
    const { fetch } = fakeFetch(() => json([book(5, "audiobook", "", 1), book(6, "audiobook")]));
    const client = createChaptarrClient(connection, fetch);
    expect(await hasBookFile(client, { authorId: 1, bookId: 5 })).toEqual({
      ok: true,
      value: true,
    });
    expect(await hasBookFile(client, { authorId: 1, bookId: 6 })).toEqual({
      ok: true,
      value: false,
    });
  });
});
