import type { MediaType } from "#/lib/requests";

/** A search result or detail page item, whatever its provider (client-safe). */
export type MediaSummary = {
  type: MediaType;
  /** Metadata provider, e.g. "audible". */
  source: string;
  /** ASIN for audiobooks. */
  externalId: string;
  title: string;
  subtitle?: string;
  authors: string[];
  narrators: string[];
  publisher?: string;
  /** ISO date (YYYY-MM-DD). */
  releaseDate?: string;
  /** `id`: the provider's series id (Audible series ASIN, Hardcover series id), for its page. */
  series: { name: string; position?: string; id?: string }[];
  /** Authors with the provider's id, for author pages (when the provider gives one). */
  authorRefs?: { id: string; name: string }[];
  coverUrl?: string;
  language?: string;
  durationMinutes?: number;
  /** Page count (eBooks). */
  pages?: number;
  /**
   * Canonical 3-letter codes of the languages the work exists in (null: an
   * edition without one). Undefined when the provider didn't say.
   */
  languages?: (string | null)[];
  /** Readers' average out of 5 and how many rated it (left out when nobody did). */
  rating?: MediaRating;
};

export type MediaRating = { value: number; count: number };

/** A genre or keyword of a title (Audible category, Hardcover genre or mood), browsable. */
export type MediaTag = { id: string; name: string };

export type MediaDetails = MediaSummary & {
  /** Plain text (provider HTML is stripped). */
  description?: string;
  tags?: MediaTag[];
};

/** The titles of a genre or keyword, one page at a time. */
export type MediaTagPage = { name: string; items: MediaSummary[] };

/** A series or an author page: its works in order, with what the provider says about it. */
export type MediaCollection = {
  name: string;
  description?: string;
  imageUrl?: string;
  items: MediaSummary[];
  /** Series only: box sets and omnibuses of several volumes, kept apart from the volumes. */
  collections?: MediaSummary[];
  /** Series only: the genres and moods most of its volumes share. */
  tags?: MediaTag[];
};

/** A series found by search (eBooks: Hardcover), for its card. */
export type SeriesSummary = {
  id: string;
  name: string;
  author?: string;
  booksCount: number;
  /** The first book's cover. */
  coverUrl?: string;
  /** Languages of its first books, as in MediaSummary (undefined: unknown). */
  languages?: (string | null)[];
};
