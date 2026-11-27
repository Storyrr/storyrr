import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { FetchFn, ServiceResult } from "#/server/services/result";
import { ok, requestJson } from "#/server/services/result";

/*
 * Kavita API, checked against its source (Kareadita/Kavita, Kavita.Server/Controllers):
 * camelCase JSON, numeric enums. A plugin trades the user's Auth Key for a JWT with
 * POST /api/Plugin/authenticate?apiKey=&pluginName=, then calls the API with it.
 */

const UserSchema = v.looseObject({ token: v.string() });
const LibrarySchema = v.looseObject({
  id: v.number(),
  name: v.nullable(v.string()),
  type: v.optional(v.number()),
});
export type KavitaLibrary = v.InferOutput<typeof LibrarySchema>;
const SeriesSchema = v.looseObject({
  id: v.number(),
  name: v.nullable(v.string()),
  localizedName: v.optional(v.nullable(v.string())),
  originalName: v.optional(v.nullable(v.string())),
  libraryId: v.number(),
});

/** A series' volumes and their chapters: in a book library, each chapter is a book (one EPUB). */
const VolumesSchema = v.array(
  v.looseObject({
    id: v.optional(v.number()),
    /** Below zero for Kavita's own groups (specials, loose chapters): not a book's volume. */
    minNumber: v.optional(v.nullable(v.number())),
    chapters: v.optional(
      v.array(
        v.looseObject({
          titleName: v.optional(v.nullable(v.string())),
          files: v.optional(
            v.nullable(v.array(v.looseObject({ filePath: v.optional(v.nullable(v.string())) }))),
          ),
        }),
      ),
      [],
    ),
  }),
);

/**
 * Library types whose series group whole books (Kavita's LibraryType: Book 2,
 * LightNovel 4). There a series may be a real series ("Mistborn") or a list
 * from the EPUB's metadata ("The Guardian's 100 Best Novels"): either way the
 * books' own titles are in the chapters.
 */
const BOOK_LIBRARY_TYPES = new Set([2, 4]);
/** Series whose volumes are fetched at once. */
const VOLUME_CONCURRENCY = 8;

export type KavitaSeries = {
  seriesId: number;
  libraryId: number;
  names: string[];
  /** Its books' files, as Kavita mounts them (book libraries only). */
  paths: string[];
  /** Its books that have their own page: a volume each (book libraries only). */
  books: { volumeId: number; titles: string[]; paths: string[] }[];
};

// Login (POST /api/Account/login → UserDto) and users (GET /api/Users), checked
// against a running Kavita 0.9.1 on 2026-11-25.
const KavitaUserSchema = v.looseObject({
  id: v.optional(v.number()),
  username: v.string(),
  email: v.optional(v.nullable(v.string())),
});
export type KavitaUser = v.InferOutput<typeof KavitaUserSchema>;
export type KavitaConnection = { url: string; apiKey: string };

const PAGE_SIZE = 500;
/** Safety cap: 100,000 series. */
const MAX_PAGES = 200;

export function createKavitaClient({ url, apiKey }: KavitaConnection, fetch: FetchFn) {
  const base = url.replace(/\/+$/, "");
  let jwt: string | undefined;

  async function authenticate(): Promise<ServiceResult<string>> {
    const target = new URL(`${base}/api/Plugin/authenticate`);
    target.search = new URLSearchParams({ apiKey, pluginName: "Storyrr" }).toString();
    const result = await requestJson({
      fetch,
      service: "Kavita",
      url: target,
      schema: UserSchema,
      init: { method: "POST" },
      timeoutMs: 15_000,
    });
    if (!result.ok) return result;
    jwt = result.value.token;
    return ok(jwt);
  }

  /** Calls the API with the JWT, authenticating first and once more if it expired. */
  async function call<TSchema extends v.GenericSchema>(
    method: string,
    path: string,
    schema: TSchema,
    { query, body }: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<ServiceResult<v.InferOutput<TSchema>>> {
    const target = new URL(`${base}${path}`);
    if (query) target.search = new URLSearchParams(query).toString();
    const send = () =>
      requestJson({
        fetch,
        service: "Kavita",
        url: target,
        schema,
        timeoutMs: 30_000,
        init: {
          method,
          headers: {
            Authorization: `Bearer ${jwt}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      });
    if (!jwt) {
      const token = await authenticate();
      if (!token.ok) return token;
    }
    const first = await send();
    if (first.ok || first.error.kind !== "auth_failed") return first;
    // The JWT expired: get a new one once.
    const token = await authenticate();
    return token.ok ? send() : token;
  }

  return {
    /** Checks a user's own credentials (sign in with Kavita); no Auth Key involved. */
    login: async (username: string, password: string): Promise<ServiceResult<KavitaUser>> =>
      requestJson({
        fetch,
        service: "Kavita",
        url: new URL(`${base}/api/Account/login`),
        schema: KavitaUserSchema,
        timeoutMs: 15_000,
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        },
      }),

    /** The server's accounts (import users); the Auth Key's user must be an admin. */
    users: () => call("GET", "/api/Users", v.array(KavitaUserSchema)),

    /** Also the connection test: authenticates with the Auth Key. */
    libraries: () => call("GET", "/api/Library/libraries", v.array(LibrarySchema)),

    /** Every series the key's user can see, across libraries, with its books' titles in book libraries. */
    async allSeries(): Promise<ServiceResult<KavitaSeries[]>> {
      const series: KavitaSeries[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await call("POST", "/api/Series/all-v2", v.array(SeriesSchema), {
          query: { PageNumber: String(page), PageSize: String(PAGE_SIZE) },
          body: { statements: [], combination: 1, limitTo: 0 },
        });
        if (!result.ok) return result;
        for (const item of result.value) {
          const names = [item.name, item.localizedName, item.originalName].filter(
            (name): name is string => Boolean(name),
          );
          series.push({
            seriesId: item.id,
            libraryId: item.libraryId,
            names,
            paths: [],
            books: [],
          });
        }
        if (result.value.length < PAGE_SIZE) break;
      }
      const libraries = await call("GET", "/api/Library/libraries", v.array(LibrarySchema));
      if (!libraries.ok) return libraries;
      const bookLibraries = new Set(
        libraries.value.filter((l) => BOOK_LIBRARY_TYPES.has(l.type ?? -1)).map((l) => l.id),
      );
      const books = series.filter((item) => bookLibraries.has(item.libraryId));
      for (let start = 0; start < books.length; start += VOLUME_CONCURRENCY) {
        const batch = books.slice(start, start + VOLUME_CONCURRENCY);
        const volumes = await Promise.all(
          batch.map((item) =>
            call("GET", "/api/Series/volumes", VolumesSchema, {
              query: { seriesId: String(item.seriesId) },
            }),
          ),
        );
        for (const [index, result] of volumes.entries()) {
          if (!result.ok) return result;
          const item = batch[index];
          if (!item) continue;
          for (const volume of result.value) {
            const titles: string[] = [];
            const paths: string[] = [];
            for (const chapter of volume.chapters) {
              if (chapter.titleName) titles.push(chapter.titleName);
              for (const file of chapter.files ?? []) if (file.filePath) paths.push(file.filePath);
            }
            item.names.push(...titles);
            item.paths.push(...paths);
            if (volume.id !== undefined && (volume.minNumber ?? 0) >= 0)
              item.books.push({ volumeId: volume.id, titles, paths });
          }
        }
      }
      return ok(series.map((item) => ({ ...item, names: [...new Set(item.names)] })));
    },
  };
}

export type KavitaClient = ReturnType<typeof createKavitaClient>;
