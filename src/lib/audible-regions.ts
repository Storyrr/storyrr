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

/** The Apple (iTunes) store for a region: the same two letters, except the United Kingdom ("gb"). */
export function itunesCountry(region: AudibleRegion): string {
  return region === "uk" ? "gb" : region;
}
