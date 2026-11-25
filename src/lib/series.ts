import type { MediaSummary, MediaTag, SeriesSummary } from "#/lib/media";
import type { MediaAvailability } from "#/lib/request-status";

/**
 * Whether a series position covers several volumes ("1-3", "0, 3", "1 & 2"): a box
 * set or omnibus, not a volume. Hardcover's own compilation flag is unreliable
 * (checked on 2026-11-25: a 4-book collection unflagged, a first volume flagged).
 */
export function isCollectionPosition(position: string | undefined): boolean {
  return position !== undefined && /\d\s*[-–—,&+]\s*\d/u.test(position);
}

/** A search result with its status, as the media server functions return it. */
export type AnnotatedTitle = MediaSummary & {
  availability: MediaAvailability;
  accepted: boolean | null;
};

/** A series in search results: the volumes the search found, and what's known of the series. */
export type SeriesEntry = {
  id: string;
  name: string;
  authors: string[];
  coverUrl?: string;
  /** Its main volumes, when the provider said (series search); else unknown. */
  booksCount?: number;
  /** Accepted when one of its known volumes (or its first books) is; refused when all are. */
  accepted: boolean | null;
  /** From the volumes the search found: all of them in the library, or some. */
  availability: "available" | "partial" | "none";
};

export type SearchEntry =
  | { kind: "title"; item: AnnotatedTitle }
  | { kind: "series"; series: SeriesEntry };

/** Volume order: numbered volumes first, by number; then the rest. */
function byPosition(a: AnnotatedTitle, b: AnnotatedTitle): number {
  const pa = Number.parseFloat(a.series[0]?.position ?? "");
  const pb = Number.parseFloat(b.series[0]?.position ?? "");
  return (Number.isNaN(pa) ? Infinity : pa) - (Number.isNaN(pb) ? Infinity : pb);
}

/** Accepted if any is, refused if every one is known refused, else unknown. */
function combineAccepted(values: readonly (boolean | null)[]): boolean | null {
  if (values.includes(true)) return true;
  if (values.length > 0 && values.every((value) => value === false)) return false;
  return null;
}

/** A series' status from its volumes: available when all are, partly when some are. */
export type SeriesAvailability = "available" | "partial" | "requested" | "none";

export function seriesAvailability(
  items: readonly Pick<AnnotatedTitle, "availability">[],
): SeriesAvailability {
  const owned = items.filter((item) => item.availability === "available").length;
  if (items.length > 0 && owned === items.length) return "available";
  if (owned > 0) return "partial";
  if (items.some((item) => item.availability === "requested" || item.availability === "processing"))
    return "requested";
  return "none";
}

const posterAvailability = (status: SeriesAvailability) =>
  status === "available" || status === "partial" ? status : "none";

/**
 * Search results with the volumes of a series folded into one series entry
 * (Seerr shows a show once, not each season), at the place of its first volume
 * found. Series found by series search and not among the titles come after.
 */
export function groupBySeries(
  titles: readonly AnnotatedTitle[],
  extraSeries: readonly (SeriesSummary & { accepted: boolean | null })[] = [],
): SearchEntry[] {
  const volumes = new Map<string, AnnotatedTitle[]>();
  for (const item of titles) {
    const id = item.series[0]?.id;
    if (id) volumes.set(id, [...(volumes.get(id) ?? []), item]);
  }
  const extra = new Map(extraSeries.map((series) => [series.id, series]));
  const entries: SearchEntry[] = [];
  const placed = new Set<string>();
  for (const item of titles) {
    const id = item.series[0]?.id;
    if (!id) {
      entries.push({ kind: "title", item });
      continue;
    }
    if (placed.has(id)) continue;
    placed.add(id);
    const found = (volumes.get(id) ?? []).toSorted(byPosition);
    const [first] = found;
    const known = extra.get(id);
    entries.push({
      kind: "series",
      series: {
        id,
        name: item.series[0]?.name ?? item.title,
        authors: first?.authors ?? item.authors,
        coverUrl: known?.coverUrl ?? first?.coverUrl,
        booksCount: known?.booksCount,
        accepted: combineAccepted([
          ...found.map((volume) => volume.accepted),
          ...(known ? [known.accepted] : []),
        ]),
        // Only what the search found; the series page tells the rest.
        availability: posterAvailability(seriesAvailability(found)),
      },
    });
  }
  for (const series of extraSeries) {
    if (placed.has(series.id)) continue;
    placed.add(series.id);
    entries.push({
      kind: "series",
      series: {
        id: series.id,
        name: series.name,
        authors: series.author ? [series.author] : [],
        coverUrl: series.coverUrl,
        booksCount: series.booksCount,
        accepted: series.accepted,
        availability: "none",
      },
    });
  }
  return entries;
}

/**
 * A series' tags: those on at least half of its volumes, the most shared first
 * (a tag on one volume only says little about the series).
 */
export function seriesTags(perVolume: readonly (readonly MediaTag[])[], max = 10): MediaTag[] {
  const counts = new Map<string, { tag: MediaTag; volumes: number }>();
  for (const tags of perVolume) {
    for (const tag of new Map(tags.map((t) => [t.id, t])).values()) {
      const entry = counts.get(tag.id);
      counts.set(tag.id, { tag, volumes: (entry?.volumes ?? 0) + 1 });
    }
  }
  const tagged = perVolume.filter((tags) => tags.length > 0).length;
  return [...counts.values()]
    .filter((entry) => entry.volumes * 2 >= tagged)
    .toSorted((a, b) => b.volumes - a.volumes)
    .slice(0, max)
    .map((entry) => entry.tag);
}
