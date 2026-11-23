import * as v from "valibot";

import { AUDIBLE_REGION_CODES } from "#/lib/audible-regions";
import { m } from "#/paraglide/messages.js";

export const SERVICES = ["chaptarr", "audiobookshelf"] as const;
export type ServiceName = (typeof SERVICES)[number];

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

/** Where audiobook requests go by default, and with which Chaptarr profiles. */
export const AudiobookDefaultsSchema = v.object({
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
export type AudiobookDefaults = v.InferOutput<typeof AudiobookDefaultsSchema>;
