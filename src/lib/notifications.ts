import * as v from "valibot";

import { m } from "#/paraglide/messages.js";

/** What Storyrr notifies about (decided 2026-11-24, like Seerr). */
export const NOTIFICATION_EVENTS = [
  "request_pending",
  "request_auto_approved",
  "request_approved",
  "request_declined",
  "request_available",
  "request_failed",
  "issue_created",
  "issue_comment",
  "issue_resolved",
  "issue_reopened",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** Events about a user's own requests and issues (what personal notifications offer). */
export const PERSONAL_EVENTS: readonly NotificationEvent[] = [
  "request_approved",
  "request_declined",
  "request_available",
  "request_failed",
  "issue_comment",
  "issue_resolved",
  "issue_reopened",
];

export const eventLabels: Record<NotificationEvent, () => string> = {
  request_pending: m.notification_event_request_pending,
  request_auto_approved: m.notification_event_request_auto_approved,
  request_approved: m.notification_event_request_approved,
  request_declined: m.notification_event_request_declined,
  request_available: m.notification_event_request_available,
  request_failed: m.notification_event_request_failed,
  issue_created: m.notification_event_issue_created,
  issue_comment: m.notification_event_issue_comment,
  issue_resolved: m.notification_event_issue_resolved,
  issue_reopened: m.notification_event_issue_reopened,
};

export const NOTIFICATION_AGENTS = [
  "email",
  "discord",
  "slack",
  "telegram",
  "ntfy",
  "gotify",
  "pushover",
  "pushbullet",
  "webhook",
] as const;
export type NotificationAgent = (typeof NOTIFICATION_AGENTS)[number];

/** A form field of an agent's settings; `secret` fields are never sent back (eye button reveals). */
export type AgentField = {
  name: string;
  label: () => string;
  description?: () => string;
  kind: "text" | "url" | "secret" | "number" | "switch" | "textarea";
  required?: boolean;
};

const url = () =>
  v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(() => m.validation_required()),
    v.url(() => m.validation_url()),
  );
const required = () =>
  v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(() => m.validation_required()),
  );
const optional = () => v.optional(v.pipe(v.string(), v.trim()), "");

/** Default JSON body of the webhook agent ({{variables}} are filled in, JSON-escaped). */
export const DEFAULT_WEBHOOK_TEMPLATE = `{
  "event": "{{event}}",
  "subject": "{{subject}}",
  "message": "{{message}}",
  "image": "{{image}}",
  "url": "{{url}}",
  "media": {
    "type": "{{media_type}}",
    "title": "{{media_title}}",
    "externalId": "{{media_external_id}}"
  },
  "request": { "id": "{{request_id}}", "requestedBy": "{{requested_by}}" },
  "issue": { "id": "{{issue_id}}", "type": "{{issue_type}}", "reportedBy": "{{reported_by}}" },
  "comment": "{{comment}}"
}`;

export const WEBHOOK_VARIABLES = [
  "event",
  "subject",
  "message",
  "image",
  "url",
  "media_type",
  "media_title",
  "media_external_id",
  "request_id",
  "requested_by",
  "issue_id",
  "issue_type",
  "reported_by",
  "comment",
] as const;

/** Each agent: its settings fields and the Valibot schema they validate with. */
export const AGENT_DEFINITIONS = {
  email: {
    label: m.notification_agent_email,
    fields: [
      { name: "host", label: m.field_smtp_host, kind: "text", required: true },
      { name: "port", label: m.field_smtp_port, kind: "number", required: true },
      {
        name: "secure",
        label: m.field_smtp_secure,
        description: m.field_smtp_secure_description,
        kind: "switch",
      },
      { name: "user", label: m.field_smtp_user, kind: "text" },
      { name: "password", label: m.field_smtp_password, kind: "secret" },
      { name: "fromAddress", label: m.field_email_from, kind: "text", required: true },
      { name: "fromName", label: m.field_email_from_name, kind: "text" },
    ],
    schema: v.object({
      host: required(),
      port: v.pipe(
        v.number(() => m.validation_required()),
        v.integer(),
        v.minValue(1),
        v.maxValue(65535),
      ),
      secure: v.boolean(),
      user: optional(),
      password: optional(),
      fromAddress: v.pipe(
        v.string(),
        v.trim(),
        v.email(() => m.validation_email()),
      ),
      fromName: optional(),
    }),
  },
  discord: {
    label: m.notification_agent_discord,
    fields: [
      {
        name: "webhookUrl",
        label: m.field_webhook_url,
        description: m.field_discord_webhook_description,
        kind: "secret",
        required: true,
      },
      { name: "username", label: m.field_bot_username, kind: "text" },
    ],
    schema: v.object({ webhookUrl: url(), username: optional() }),
  },
  slack: {
    label: m.notification_agent_slack,
    fields: [{ name: "webhookUrl", label: m.field_webhook_url, kind: "secret", required: true }],
    schema: v.object({ webhookUrl: url() }),
  },
  telegram: {
    label: m.notification_agent_telegram,
    fields: [
      {
        name: "botToken",
        label: m.field_telegram_bot_token,
        description: m.field_telegram_bot_token_description,
        kind: "secret",
        required: true,
      },
      {
        name: "chatId",
        label: m.field_telegram_chat_id,
        description: m.field_telegram_chat_id_description,
        kind: "text",
      },
    ],
    schema: v.object({ botToken: required(), chatId: optional() }),
  },
  ntfy: {
    label: m.notification_agent_ntfy,
    fields: [
      { name: "url", label: m.field_server_url, kind: "url", required: true },
      { name: "topic", label: m.field_ntfy_topic, kind: "text", required: true },
      {
        name: "token",
        label: m.field_access_token,
        description: m.field_optional_token_description,
        kind: "secret",
      },
    ],
    schema: v.object({ url: url(), topic: required(), token: optional() }),
  },
  gotify: {
    label: m.notification_agent_gotify,
    fields: [
      { name: "url", label: m.field_server_url, kind: "url", required: true },
      { name: "token", label: m.field_application_token, kind: "secret", required: true },
      { name: "priority", label: m.field_priority, kind: "number" },
    ],
    schema: v.object({
      url: url(),
      token: required(),
      priority: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10)), 5),
    }),
  },
  pushover: {
    label: m.notification_agent_pushover,
    fields: [
      { name: "appToken", label: m.field_application_token, kind: "secret", required: true },
      {
        name: "userKey",
        label: m.field_pushover_user_key,
        description: m.field_pushover_user_key_description,
        kind: "secret",
      },
    ],
    schema: v.object({ appToken: required(), userKey: optional() }),
  },
  pushbullet: {
    label: m.notification_agent_pushbullet,
    fields: [
      { name: "accessToken", label: m.field_access_token, kind: "secret", required: true },
      { name: "channelTag", label: m.field_pushbullet_channel, kind: "text" },
    ],
    schema: v.object({ accessToken: required(), channelTag: optional() }),
  },
  webhook: {
    label: m.notification_agent_webhook,
    fields: [
      { name: "url", label: m.field_webhook_url, kind: "url", required: true },
      {
        name: "authHeader",
        label: m.field_authorization_header,
        description: m.field_authorization_header_description,
        kind: "secret",
      },
      {
        name: "template",
        label: m.field_json_payload,
        description: () =>
          m.field_json_payload_description({
            variables: WEBHOOK_VARIABLES.map((name) => `{{${name}}}`).join(", "),
          }),
        kind: "textarea",
        required: true,
      },
    ],
    schema: v.object({
      url: url(),
      authHeader: optional(),
      template: v.pipe(
        v.string(),
        v.check(
          (value) => isValidTemplate(value),
          () => m.validation_json(),
        ),
      ),
    }),
  },
} as const satisfies Record<
  NotificationAgent,
  { label: () => string; fields: readonly AgentField[]; schema: v.GenericSchema }
>;

export type AgentConfig<A extends NotificationAgent> = v.InferOutput<
  (typeof AGENT_DEFINITIONS)[A]["schema"]
>;

/** An agent with its config, tagged so a `switch (target.agent)` narrows the config. */
export type AgentTarget = {
  [A in NotificationAgent]: { agent: A; config: AgentConfig<A> };
}[NotificationAgent];

/** Fills the webhook template's {{variables}} with JSON-escaped values. */
export function renderTemplate(template: string, values: Partial<Record<string, string>>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, name: string) =>
    JSON.stringify(values[name] ?? "").slice(1, -1),
  );
}

function isValidTemplate(template: string): boolean {
  try {
    JSON.parse(renderTemplate(template, {}));
    return true;
  } catch {
    return false;
  }
}

/** Settings shared by every agent: on/off and which events it gets. */
export const AgentCommonSchema = v.object({
  enabled: v.boolean(),
  events: v.array(v.picklist(NOTIFICATION_EVENTS)),
});

/** A user's own notification preferences (Profile → Settings → Notifications). */
export const UserNotificationsSchema = v.object({
  email: v.boolean(),
  discordId: v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^\d*$/, () => m.validation_discord_id()),
  ),
  telegramChatId: v.pipe(v.string(), v.trim()),
  pushoverUserKey: v.pipe(v.string(), v.trim()),
  pushbulletToken: v.pipe(v.string(), v.trim()),
  events: v.array(v.picklist(NOTIFICATION_EVENTS)),
});
export type UserNotifications = v.InferOutput<typeof UserNotificationsSchema>;
export const DEFAULT_USER_NOTIFICATIONS: UserNotifications = {
  email: true,
  discordId: "",
  telegramChatId: "",
  pushoverUserKey: "",
  pushbulletToken: "",
  // Every event: a user only gets those about their requests and issues, or what they manage.
  events: [...NOTIFICATION_EVENTS],
};
