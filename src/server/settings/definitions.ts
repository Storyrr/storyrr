import "@tanstack/react-start/server-only";
import * as v from "valibot";

import {
  FormatDefaultsSchema,
  LibrarySelectionSchema,
  MetadataSettingsSchema,
  UserSettingsSchema,
} from "#/lib/schemas/settings";

import { AGENT_DEFINITIONS, AgentCommonSchema, type NotificationAgent } from "#/lib/notifications";
import { locales } from "#/paraglide/runtime.js";

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

/** Settings → Users: auto-approval default for new accounts, global request limits. */
export const userSettings = defineSetting({
  key: "users",
  schema: UserSettingsSchema,
  secret: false,
});

/** Libraries left out of the availability index, per media server. */
export const librarySelection = {
  audiobookshelf: defineSetting({
    key: "libraries.audiobookshelf",
    schema: LibrarySelectionSchema,
    secret: false,
  }),
  kavita: defineSetting({ key: "libraries.kavita", schema: LibrarySelectionSchema, secret: false }),
} as const;

const agentSetting = <TConfig extends v.GenericSchema>(agent: NotificationAgent, config: TConfig) =>
  defineSetting({
    key: `notifications.${agent}`,
    schema: v.object({ ...AgentCommonSchema.entries, config }),
    secret: true,
  });

/** One setting per notification agent: on/off, its events and its config (tokens: sealed). */
export const notificationAgentSettings = {
  email: agentSetting("email", AGENT_DEFINITIONS.email.schema),
  discord: agentSetting("discord", AGENT_DEFINITIONS.discord.schema),
  slack: agentSetting("slack", AGENT_DEFINITIONS.slack.schema),
  telegram: agentSetting("telegram", AGENT_DEFINITIONS.telegram.schema),
  ntfy: agentSetting("ntfy", AGENT_DEFINITIONS.ntfy.schema),
  gotify: agentSetting("gotify", AGENT_DEFINITIONS.gotify.schema),
  pushover: agentSetting("pushover", AGENT_DEFINITIONS.pushover.schema),
  pushbullet: agentSetting("pushbullet", AGENT_DEFINITIONS.pushbullet.schema),
  webhook: agentSetting("webhook", AGENT_DEFINITIONS.webhook.schema),
  webpush: agentSetting("webpush", AGENT_DEFINITIONS.webpush.schema),
} satisfies Record<NotificationAgent, unknown>;

/** Language of notifications sent to shared channels (personal ones use each user's). */
export const notificationGeneral = defineSetting({
  key: "notifications.general",
  schema: v.object({ locale: v.picklist(locales) }),
  secret: false,
});

/** VAPID key pair signing Web Push messages (generated on first use). */
export const vapidKeys = defineSetting({
  key: "notifications.webpush.vapid",
  schema: v.object({ publicKey: v.string(), privateKey: v.string() }),
  secret: true,
});
