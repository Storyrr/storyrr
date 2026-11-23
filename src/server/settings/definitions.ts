import "@tanstack/react-start/server-only";
import * as v from "valibot";

import { AudiobookDefaultsSchema, MetadataSettingsSchema } from "#/lib/schemas/settings";

import { defineSetting } from "./store";

const StoredConnectionSchema = v.object({
  url: v.pipe(v.string(), v.url()),
  apiKey: v.pipe(v.string(), v.nonEmpty()),
});

export const chaptarrConnection = defineSetting({
  key: "services.chaptarr",
  schema: StoredConnectionSchema,
  secret: true,
});

export const audiobookshelfConnection = defineSetting({
  key: "services.audiobookshelf",
  schema: StoredConnectionSchema,
  secret: true,
});

export const metadataSettings = defineSetting({
  key: "metadata",
  schema: MetadataSettingsSchema,
  secret: false,
});

export const audiobookDefaults = defineSetting({
  key: "defaults.audiobook",
  schema: AudiobookDefaultsSchema,
  secret: false,
});

export const connectionSettings = {
  chaptarr: chaptarrConnection,
  audiobookshelf: audiobookshelfConnection,
} as const;
