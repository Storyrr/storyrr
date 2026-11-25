/** Audible region codes (client-safe: the settings form lists them). */
export const AUDIBLE_REGION_CODES = [
  "us",
  "ca",
  "uk",
  "au",
  "fr",
  "de",
  "it",
  "es",
  "in",
  "jp",
] as const;

export type AudibleRegion = (typeof AUDIBLE_REGION_CODES)[number];

const AUDIBLE_HOSTS: Record<AudibleRegion, string> = {
  us: "api.audible.com",
  ca: "api.audible.ca",
  uk: "api.audible.co.uk",
  au: "api.audible.com.au",
  fr: "api.audible.fr",
  de: "api.audible.de",
  it: "api.audible.it",
  es: "api.audible.es",
  in: "api.audible.in",
  jp: "api.audible.co.jp",
};

export const DEFAULT_AUDIBLE_REGION: AudibleRegion = "fr";

export function audibleHost(region: AudibleRegion): string {
  return AUDIBLE_HOSTS[region];
}

/**
 * The Audible `locale` asking for genre names in the reader's language (checked on
 * 2026-11-25). Each store offers its own few: audible.fr and audible.de also
 * English with "en-GB", audible.ca also French with "fr-CA", audible.com also
 * Spanish with "es-US"; others one language.
 * A locale a store doesn't offer is ignored (its own language comes back), so
 * these are safe everywhere. Only genre names change: titles stay the store's.
 */
export const AUDIBLE_GENRE_LOCALES: Record<string, string> = {
  en: "en-GB",
  fr: "fr-CA",
  // audible.com also offers Spanish; no store offers German besides audible.de's own.
  es: "es-US",
  de: "de-DE",
};
