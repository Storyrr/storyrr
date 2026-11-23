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
};

export type MediaDetails = MediaSummary & {
  /** Plain text (provider HTML is stripped). */
  description?: string;
};
