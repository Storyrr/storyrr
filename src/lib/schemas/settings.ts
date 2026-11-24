import * as v from "valibot";

import { AUDIBLE_REGION_CODES } from "#/lib/audible-regions";
import { m } from "#/paraglide/messages.js";

/** Services connected with a URL and an API / Auth key. */
export const SERVICES = ["chaptarr", "audiobookshelf", "kavita"] as const;
export type ServiceName = (typeof SERVICES)[number];

/** Every external service whose errors the UI explains. */
export const EXTERNAL_SERVICES = [
  "chaptarr",
  "audiobookshelf",
  "kavita",
  "hardcover",
  "audible",
] as const;
export type ExternalService = (typeof EXTERNAL_SERVICES)[number];

/** Formats Chaptarr fetches. */
export const CHAPTARR_FORMATS = ["audiobook", "ebook"] as const;
export type ChaptarrFormat = (typeof CHAPTARR_FORMATS)[number];

/** A service connection as edited in the form. A blank API key keeps the stored one. */
export const ConnectionFormSchema = v.object({
  url: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(() => m.validation_required()),
    v.url(() => m.validation_url()),
    v.regex(/^https?:\/\//i, () => m.validation_url()),
  ),
  apiKey: v.pipe(v.string(), v.trim()),
});
export type ConnectionForm = v.InferOutput<typeof ConnectionFormSchema>;

export const ServiceConnectionInputSchema = v.object({
  service: v.picklist(SERVICES),
  connection: ConnectionFormSchema,
});

export const MetadataSettingsSchema = v.object({
  audibleRegion: v.picklist(AUDIBLE_REGION_CODES, () => m.validation_required()),
});
export type MetadataSettings = v.InferOutput<typeof MetadataSettingsSchema>;

/** Where requests of one format go by default, and with which Chaptarr profiles. */
export const FormatDefaultsSchema = v.object({
  rootFolderPath: v.pipe(
    v.string(),
    v.nonEmpty(() => m.validation_required()),
  ),
  qualityProfileId: v.pipe(
    v.number(() => m.validation_required()),
    v.integer(),
  ),
  metadataProfileId: v.pipe(
    v.number(() => m.validation_required()),
    v.integer(),
  ),
});
export type FormatDefaults = v.InferOutput<typeof FormatDefaultsSchema>;

export const SaveFormatDefaultsSchema = v.object({
  format: v.picklist(CHAPTARR_FORMATS),
  defaults: FormatDefaultsSchema,
});

export const FormatInputSchema = v.object({ format: v.picklist(CHAPTARR_FORMATS) });

/** The Hardcover API token as edited in the form. Blank keeps the stored one. */
export const HardcoverTokenFormSchema = v.object({ token: v.pipe(v.string(), v.trim()) });
export type HardcoverTokenForm = v.InferOutput<typeof HardcoverTokenFormSchema>;
