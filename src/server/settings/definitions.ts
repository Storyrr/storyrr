import "@tanstack/react-start/server-only";
import * as v from "valibot";

import {
  FormatDefaultsSchema,
  MetadataSettingsSchema,
  PodcastDefaultsSchema,
  RequestPolicySchema,
} from "#/lib/schemas/settings";

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

export const kavitaConnection = defineSetting({
  key: "services.kavita",
  schema: StoredConnectionSchema,
  secret: true,
});

/** Hardcover personal API token (eBook search). */
export const hardcoverToken = defineSetting({
  key: "services.hardcover.token",
  schema: v.pipe(v.string(), v.nonEmpty()),
  secret: true,
});

export const audiobookDefaults = defineSetting({
  key: "defaults.audiobook",
  schema: FormatDefaultsSchema,
  secret: false,
});

export const ebookDefaults = defineSetting({
  key: "defaults.ebook",
  schema: FormatDefaultsSchema,
  secret: false,
});

export const formatDefaults = { audiobook: audiobookDefaults, ebook: ebookDefaults } as const;

export const connectionSettings = {
  chaptarr: chaptarrConnection,
  audiobookshelf: audiobookshelfConnection,
  kavita: kavitaConnection,
} as const;

/** Shared secret in the Chaptarr webhook URL (generated on first use). */
export const chaptarrWebhookToken = defineSetting({
  key: "webhooks.chaptarr.token",
  schema: v.pipe(v.string(), v.minLength(32)),
  secret: true,
});

export const podcastDefaults = defineSetting({
  key: "defaults.podcast",
  schema: PodcastDefaultsSchema,
  secret: false,
});

export const requestPolicy = defineSetting({
  key: "policy.requests",
  schema: RequestPolicySchema,
  secret: false,
});
