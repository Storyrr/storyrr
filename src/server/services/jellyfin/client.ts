import "@tanstack/react-start/server-only";
import * as v from "valibot";

import type { FetchFn, ServiceResult } from "#/server/services/result";
import { ok, requestJson } from "#/server/services/result";

/*
 * Jellyfin API, checked against its source (jellyfin/jellyfin, commit c3686c5:
 * Jellyfin.Api/Controllers, Jellyfin.Server.Implementations/Security/AuthorizationContext.cs).
 * The token goes in `Authorization: MediaBrowser Token="…"` (X-Emby-Token is legacy,
 * off unless enabled); JSON is PascalCase. Books and audiobooks live in "books"
 * libraries as `Book` and `AudioBook` items (one per audio file, Album = the book).
 */

// UNVERIFIED: CollectionType values ("books", "mixed") are the enum names lowercased, as
// read in the source; not checked against a running server.
const VirtualFolderSchema = v.looseObject({
  Name: v.string(),
  ItemId: v.string(),
  CollectionType: v.optional(v.nullable(v.string())),
});

const ItemSchema = v.looseObject({
  Id: v.string(),
  Name: v.optional(v.nullable(v.string())),
  Type: v.string(),
  Album: v.optional(v.nullable(v.string())),
  AlbumArtist: v.optional(v.nullable(v.string())),
  SeriesName: v.optional(v.nullable(v.string())),
});
const ItemsPageSchema = v.looseObject({
  Items: v.array(ItemSchema),
  TotalRecordCount: v.optional(v.number()),
});

const UserSchema = v.looseObject({ Id: v.string(), Name: v.string() });
export type JellyfinUser = v.InferOutput<typeof UserSchema>;
const AuthenticationSchema = v.looseObject({ User: UserSchema, AccessToken: v.string() });

export type JellyfinLibrary = { id: string; name: string };
export type JellyfinItem = {
  itemId: string;
  libraryId: string;
  format: "audiobook" | "ebook";
  titles: string[];
  author: string;
};

export type JellyfinConnection = { url: string; apiKey: string };

/** Library kinds that can hold books and audiobooks. */
const BOOK_COLLECTIONS = new Set(["books", "mixed"]);
const PAGE_SIZE = 500;
/** Safety cap: 100,000 items per library. */
const MAX_PAGES = 200;

/** The MediaBrowser authorization header: Storyrr as the client, with a token once known. */
function authorization(token?: string) {
  const fields = [
    'Client="Storyrr"',
    'Device="Storyrr"',
    'DeviceId="storyrr"',
    'Version="1"',
    ...(token ? [`Token="${token}"`] : []),
  ];
  return `MediaBrowser ${fields.join(", ")}`;
}

export function createJellyfinClient({ url, apiKey }: JellyfinConnection, fetch: FetchFn) {
  const base = url.replace(/\/+$/, "");

  function call<TSchema extends v.GenericSchema>(
    path: string,
    schema: TSchema,
    query?: Record<string, string>,
  ): Promise<ServiceResult<v.InferOutput<TSchema>>> {
    const target = new URL(`${base}${path}`);
    if (query) target.search = new URLSearchParams(query).toString();
    return requestJson({
      fetch,
      service: "Jellyfin",
      url: target,
      schema,
      timeoutMs: 30_000,
      init: { headers: { Authorization: authorization(apiKey), Accept: "application/json" } },
    });
  }

  /** The book and audiobook libraries (Dashboard → Libraries). */
  async function libraries(): Promise<ServiceResult<JellyfinLibrary[]>> {
    const result = await call("/Library/VirtualFolders", v.array(VirtualFolderSchema));
    if (!result.ok) return result;
    return ok(
      result.value
        .filter((folder) => BOOK_COLLECTIONS.has((folder.CollectionType ?? "").toLowerCase()))
        .map((folder) => ({ id: folder.ItemId, name: folder.Name })),
    );
  }

  return {
    libraries,

    /**
     * Checks a user's own credentials (sign in with Jellyfin), then ends the session
     * it opened: Storyrr keeps no Jellyfin token.
     */
    async login(username: string, password: string): Promise<ServiceResult<JellyfinUser>> {
      const result = await requestJson({
        fetch,
        service: "Jellyfin",
        url: new URL(`${base}/Users/AuthenticateByName`),
        schema: AuthenticationSchema,
        timeoutMs: 15_000,
        init: {
          method: "POST",
          headers: { Authorization: authorization(), "Content-Type": "application/json" },
          body: JSON.stringify({ Username: username, Pw: password }),
        },
      });
      if (!result.ok) return result;
      // Best effort: a leftover session only shows in Jellyfin's dashboard.
      await fetch(`${base}/Sessions/Logout`, {
        method: "POST",
        headers: { Authorization: authorization(result.value.AccessToken) },
        signal: AbortSignal.timeout(5_000),
      }).catch(() => undefined);
      return ok(result.value.User);
    },

    /** The server's accounts (import users); Jellyfin keeps no email. */
    users: () => call("/Users", v.array(UserSchema)),

    /** Every book and audiobook of the given libraries. */
    async allItems(libraryIds: readonly string[]): Promise<ServiceResult<JellyfinItem[]>> {
      const items: JellyfinItem[] = [];
      for (const libraryId of libraryIds) {
        for (let page = 0; page < MAX_PAGES; page++) {
          const result = await call("/Items", ItemsPageSchema, {
            ParentId: libraryId,
            Recursive: "true",
            IncludeItemTypes: "AudioBook,Book",
            StartIndex: String(page * PAGE_SIZE),
            Limit: String(PAGE_SIZE),
            EnableImages: "false",
            EnableUserData: "false",
          });
          if (!result.ok) return result;
          for (const item of result.value.Items) {
            const audio = item.Type === "AudioBook";
            // An audiobook's files share their Album (the book); a book's Name is its title.
            const titles = (audio ? [item.Album, item.Name] : [item.Name]).filter(
              (title): title is string => Boolean(title),
            );
            items.push({
              itemId: item.Id,
              libraryId,
              format: audio ? "audiobook" : "ebook",
              titles: [...new Set(titles)],
              author: item.AlbumArtist ?? "",
            });
          }
          if (result.value.Items.length < PAGE_SIZE) break;
        }
      }
      return ok(items);
    },
  };
}

export type JellyfinClient = ReturnType<typeof createJellyfinClient>;
