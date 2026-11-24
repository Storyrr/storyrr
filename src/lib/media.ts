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
  series: { name: string; position?: string }[];
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
  /** Podcasts: the RSS feed (what Audiobookshelf subscribes to and ownership is matched by). */
  feedUrl?: string;
  /** Podcasts: number of episodes in the directory. */
  episodeCount?: number;
  genres?: string[];
};

export type MediaDetails = MediaSummary & {
  /** Plain text (provider HTML is stripped). */
  description?: string;
};
