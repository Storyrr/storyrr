import "@tanstack/react-start/server-only";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { parentPath, pathKey, titleKey } from "#/lib/match";
import type { MediaSummary } from "#/lib/media";
import type { SearchableType } from "#/lib/media-types";
import { LIBRARY_SERVICES, type LibraryService } from "#/lib/schemas/settings";
import type { AppDatabase } from "#/server/db/client";
import { libraryItem } from "#/server/db/schema";
import type { Services } from "#/server/services/factory";
import { connectionSettings } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";
import { ebookTitles } from "#/server/sources";

import { baseItemId, hardcoverKey } from "./index";

export type LibraryLink = { service: LibraryService; url: string };

type Row = { backend: string; itemId: string; libraryId: string; partId: string | null };

/** The page of an item in its media server's own web app. */
const itemPages: Record<LibraryService, (base: string, row: Row) => string> = {
  audiobookshelf: (base, row) => `${base}/audiobookshelf/item/${encodeURIComponent(row.itemId)}`,
  // A book of a series is one of its volumes; without one, the series itself.
  kavita: (base, row) =>
    `${base}/library/${encodeURIComponent(row.libraryId)}/series/${encodeURIComponent(row.itemId)}${
      row.partId ? `/volume/${encodeURIComponent(row.partId)}` : ""
    }`,
  komga: (base, row) =>
    row.partId
      ? `${base}/book/${encodeURIComponent(row.partId)}`
      : `${base}/series/${encodeURIComponent(row.itemId)}`,
  // The route of jellyfin-web 10.9+ (older ones used `#!/details`).
  jellyfin: (base, row) => `${base}/web/index.html#/details?id=${encodeURIComponent(row.itemId)}`,
};

/** Chaptarr books asked for their files, per title: one is enough to find the folder. */
const MAX_CHAPTARR_BOOKS = 2;

type Item = Pick<MediaSummary, "externalId" | "title" | "altTitles"> & {
  series?: readonly { name: string }[] | null;
};

/**
 * Where a title can be read or listened to: its page in each media server that
 * holds it. An item is recognized like for availability (ASIN, else title);
 * for a server that gives no match, the file Chaptarr holds for the title is
 * looked up there by its path, the same file being mounted in both.
 */
export async function libraryLinks(
  { db, services, settings }: { db: AppDatabase; services: Services; settings: SettingsStore },
  type: SearchableType,
  item: Item,
): Promise<LibraryLink[]> {
  const bases = new Map<LibraryService, string>();
  for (const service of LIBRARY_SERVICES) {
    const connection = await settings.get(connectionSettings[service]);
    if (connection)
      bases.set(service, (connection.externalUrl || connection.url).replace(/\/+$/, ""));
  }
  if (bases.size === 0) return [];

  const format = or(eq(libraryItem.format, type), isNull(libraryItem.format));
  const keys = [
    ...new Set((type === "ebook" ? ebookTitles(item) : [item.title]).map(titleKey)),
  ].filter(Boolean);
  const ids =
    type === "audiobook" ? [item.externalId.toUpperCase()] : [hardcoverKey(item.externalId)];
  const byIdOrTitle = (backends: readonly string[], titleBackends: readonly string[]) =>
    db
      .select({
        backend: libraryItem.backend,
        itemId: libraryItem.itemId,
        libraryId: libraryItem.libraryId,
        partId: libraryItem.partId,
      })
      .from(libraryItem)
      .where(
        and(
          format,
          or(
            and(inArray(libraryItem.backend, backends), inArray(libraryItem.externalId, ids)),
            keys.length > 0 && titleBackends.length > 0
              ? and(
                  inArray(libraryItem.backend, titleBackends),
                  inArray(libraryItem.matchKey, keys),
                )
              : undefined,
          ),
        ),
      )
      .all();

  const servers = [...bases.keys()];
  // Audiobookshelf's titles are often wrong: by ASIN only, like for availability.
  const found: Row[] = byIdOrTitle(
    servers,
    servers.filter((service) => service !== "audiobookshelf"),
  );

  const missing = servers.filter((service) => !found.some((row) => row.backend === service));
  const chaptarr = missing.length > 0 ? await services.chaptarr() : null;
  if (chaptarr) {
    const books = [
      ...new Set(
        byIdOrTitle(["chaptarr"], ["chaptarr"]).map((row) => Number(baseItemId(row.itemId))),
      ),
    ].filter(Number.isInteger);
    const candidates = new Set<string>();
    for (const bookId of books.slice(0, MAX_CHAPTARR_BOOKS)) {
      const files = await chaptarr.bookFiles(bookId);
      const path = files.ok ? files.value.find((file) => file.path)?.path : null;
      // An eBook's file itself, or the folder of an audiobook's files.
      if (path) candidates.add(pathKey(path)).add(pathKey(parentPath(path)));
    }
    if (candidates.size > 0)
      found.push(
        ...db
          .select({
            backend: libraryItem.backend,
            itemId: libraryItem.itemId,
            libraryId: libraryItem.libraryId,
            partId: libraryItem.partId,
          })
          .from(libraryItem)
          .where(
            and(
              format,
              inArray(libraryItem.backend, missing),
              inArray(libraryItem.pathKey, [...candidates]),
            ),
          )
          .all(),
      );
  }

  return servers.flatMap((service) => {
    const rows = found.filter((candidate) => candidate.backend === service);
    // The book's own page when the server has one, else its series or item.
    const row = rows.find((candidate) => candidate.partId) ?? rows[0];
    const base = bases.get(service);
    return row && base
      ? [{ service, url: itemPages[service](base, { ...row, itemId: baseItemId(row.itemId) }) }]
      : [];
  });
}
