import { describe, expect, it } from "vitest";

import { fakeFetch, json } from "#/server/services/test-utils";

import { createChaptarrClient, hasBookFile, submitBook, type SubmitBookInput } from "./client";
import { book, fakeChaptarr, remoteBook } from "./fake";

const connection = { url: "http://chaptarr:8789/", apiKey: "test-key" };
const input: SubmitBookInput = {
  providerId: "az:B07Q44JYLF",
  media: "audiobook",
  rootFolderPath: "/audiobooks",
  qualityProfileId: 1,
  metadataProfileId: 2,
};

describe("submitBook", () => {
  it("imports exactly this book in this media, with the author's other books left alone", async () => {
    const chaptarr = fakeChaptarr();
    const result = await submitBook(createChaptarrClient(connection, chaptarr.fetch), input);

    expect(result).toEqual({
      ok: true,
      value: { state: "added", bookId: 42, foreignBookId: "hc:1" },
    });
    const [lookup] = chaptarr.calls("GET", "/api/v1/book/lookup");
    expect(lookup?.url.searchParams.get("term")).toBe("az:B07Q44JYLF");
    expect(lookup?.url.searchParams.get("mediaType")).toBe("audiobook");
    expect(lookup?.init?.headers).toMatchObject({ "X-Api-Key": "test-key" });
    expect(chaptarr.bodyOf("POST", "/api/v1/book/import")).toEqual({
      foreignBookId: "hc:1",
      foreignAuthorId: "hc:10",
      authorName: "Frank Herbert",
      mediaType: "audiobook",
      rootFolder: "/audiobooks",
      qualityProfileId: 1,
      metadataProfileId: 2,
      authorMonitoring: { monitor: "none", searchForMissing: true },
    });
  });

  it("falls back to the requested provider ID when the lookup has none", async () => {
    const chaptarr = fakeChaptarr({ lookup: [{ ...remoteBook(), foreignBookId: null }] });
    await submitBook(createChaptarrClient(connection, chaptarr.fetch), input);
    expect(chaptarr.bodyOf("POST", "/api/v1/book/import")).toMatchObject({
      foreignBookId: "az:B07Q44JYLF",
    });
  });

  it("reports an author still waiting for metadata as pending", async () => {
    const chaptarr = fakeChaptarr({
      importResponse: {
        status: 202,
        body: { pendingId: 7, message: "Author metadata is being prepared" },
      },
    });
    expect(await submitBook(createChaptarrClient(connection, chaptarr.fetch), input)).toEqual({
      ok: true,
      value: { state: "pending", pendingId: 7, foreignBookId: "hc:1" },
    });
  });

  it("reports unknown ASINs as not found without importing anything", async () => {
    const chaptarr = fakeChaptarr({ lookup: [] });
    const result = await submitBook(createChaptarrClient(connection, chaptarr.fetch), input);
    expect(result).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(chaptarr.calls("POST", "/api/v1/book/import")).toHaveLength(0);
  });

  it("surfaces Chaptarr's refusal (validation, declared metadata refusal)", async () => {
    const invalid = fakeChaptarr({
      importResponse: {
        status: 400,
        body: [{ errorMessage: "Root folder doesn't support audiobooks" }],
      },
    });
    expect(await submitBook(createChaptarrClient(connection, invalid.fetch), input)).toMatchObject({
      ok: false,
      error: { kind: "rejected", message: "Root folder doesn't support audiobooks" },
    });
    const refused = fakeChaptarr({
      importResponse: { status: 422, body: { message: "Work is not importable" } },
    });
    expect(await submitBook(createChaptarrClient(connection, refused.fetch), input)).toMatchObject({
      ok: false,
      error: { kind: "rejected", message: "Work is not importable" },
    });
  });

  it("reports a rejected API key as auth_failed", async () => {
    const { fetch } = fakeFetch(() => new Response("Unauthorized", { status: 401 }));
    expect(await submitBook(createChaptarrClient(connection, fetch), input)).toMatchObject({
      ok: false,
      error: { kind: "auth_failed", status: 401 },
    });
  });
});

describe("hasBookFile", () => {
  it("looks for a local copy with files in the requested media", async () => {
    const chaptarr = fakeChaptarr({ lookup: [book(5, "ebook", 1), book(6, "audiobook", 0)] });
    const client = createChaptarrClient(connection, chaptarr.fetch);
    expect(await hasBookFile(client, { term: "az:B0X", media: "audiobook" })).toEqual({
      ok: true,
      value: false,
    });
    expect(await hasBookFile(client, { term: "az:B0X", media: "ebook" })).toEqual({
      ok: true,
      value: true,
    });
  });

  it("ignores remote results", async () => {
    const chaptarr = fakeChaptarr({ lookup: [{ ...remoteBook(), hasFiles: true }] });
    expect(
      await hasBookFile(createChaptarrClient(connection, chaptarr.fetch), {
        term: "az:B0X",
        media: "audiobook",
      }),
    ).toEqual({ ok: true, value: false });
  });
});

describe("rootFolders", () => {
  it("reads folder types", async () => {
    const { fetch } = fakeFetch(() =>
      json([
        { id: 1, path: "/audiobooks", name: "Audiobooks", folderType: 1 },
        { id: 2, path: "/books", name: "Books", folderType: 2 },
        { id: 3, path: "/all", name: null, folderType: 0 },
      ]),
    );
    const result = await createChaptarrClient(connection, fetch).rootFolders();
    expect(result.ok && result.value.map((f) => f.folderType)).toEqual([1, 2, 0]);
  });
});
