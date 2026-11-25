import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import {
  AGENT_DEFINITIONS,
  AgentCommonSchema,
  isPushServiceEndpoint,
  withNotificationDefaults,
  NOTIFICATION_AGENTS,
  PERSONAL_ONLY_AGENTS,
  UserNotificationChannelSchema,
  type AgentTarget,
  type NotificationAgent,
} from "#/lib/notifications";
import { m } from "#/paraglide/messages.js";
import { locales } from "#/paraglide/runtime.js";
import { requirePermission, requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { pushSubscription, userPreference } from "#/server/db/schema";
import { getAppUrl } from "#/server/app-url";
import { loadAgents, testAgent } from "#/server/notifications";
import {
  getOrCreateVapidKeys,
  removeSubscription,
  saveSubscription,
} from "#/server/notifications/webpush";
import { settings } from "#/server/settings";
import { notificationAgentSettings, notificationGeneral } from "#/server/settings/definitions";

const requireSettings = requirePermission("manage_settings");
const globalFetch: typeof fetch = (input, init) => fetch(input, init);

const secretFields = (agent: NotificationAgent): string[] =>
  AGENT_DEFINITIONS[agent].fields.filter((f) => f.kind === "secret").map((f) => f.name);

/** Parses a config for an agent into a tagged target (throws on invalid input). */
const toTarget: { [A in NotificationAgent]: (config: unknown) => AgentTarget } = {
  email: (c) => ({ agent: "email", config: v.parse(AGENT_DEFINITIONS.email.schema, c) }),
  discord: (c) => ({ agent: "discord", config: v.parse(AGENT_DEFINITIONS.discord.schema, c) }),
  slack: (c) => ({ agent: "slack", config: v.parse(AGENT_DEFINITIONS.slack.schema, c) }),
  telegram: (c) => ({ agent: "telegram", config: v.parse(AGENT_DEFINITIONS.telegram.schema, c) }),
  ntfy: (c) => ({ agent: "ntfy", config: v.parse(AGENT_DEFINITIONS.ntfy.schema, c) }),
  gotify: (c) => ({ agent: "gotify", config: v.parse(AGENT_DEFINITIONS.gotify.schema, c) }),
  pushover: (c) => ({ agent: "pushover", config: v.parse(AGENT_DEFINITIONS.pushover.schema, c) }),
  pushbullet: (c) => ({
    agent: "pushbullet",
    config: v.parse(AGENT_DEFINITIONS.pushbullet.schema, c),
  }),
  webhook: (c) => ({ agent: "webhook", config: v.parse(AGENT_DEFINITIONS.webhook.schema, c) }),
  webpush: (c) => ({ agent: "webpush", config: v.parse(AGENT_DEFINITIONS.webpush.schema, c) }),
};

type Common = v.InferOutput<typeof AgentCommonSchema>;

/** Saves a parsed target with its common settings, one typed write per agent. */
function saveTarget(common: Common, target: AgentTarget): Promise<void> {
  const s = notificationAgentSettings;
  switch (target.agent) {
    case "email":
      return settings.set(s.email, { ...common, config: target.config });
    case "discord":
      return settings.set(s.discord, { ...common, config: target.config });
    case "slack":
      return settings.set(s.slack, { ...common, config: target.config });
    case "telegram":
      return settings.set(s.telegram, { ...common, config: target.config });
    case "ntfy":
      return settings.set(s.ntfy, { ...common, config: target.config });
    case "gotify":
      return settings.set(s.gotify, { ...common, config: target.config });
    case "pushover":
      return settings.set(s.pushover, { ...common, config: target.config });
    case "pushbullet":
      return settings.set(s.pushbullet, { ...common, config: target.config });
    case "webhook":
      return settings.set(s.webhook, { ...common, config: target.config });
    default:
      return settings.set(s.webpush, { ...common, config: target.config });
  }
}

/** The stored config of an agent, if any. */
type ConfigValues = Record<string, string | number | boolean>;

async function storedConfig(agent: NotificationAgent): Promise<ConfigValues | null> {
  const stored = (await loadAgents(settings)).find((a) => a.target.agent === agent);
  return stored ? { ...stored.target.config } : null;
}

/** A typed config: blank secret fields keep the stored ones (they're never sent to the form). */
async function withStoredSecrets(agent: NotificationAgent, config: ConfigValues) {
  const stored = await storedConfig(agent);
  const merged = { ...config };
  for (const field of secretFields(agent)) {
    if (!merged[field] && stored?.[field]) merged[field] = stored[field];
  }
  return merged;
}

/** Settings → Notifications: each agent's state, with secret fields blanked. Manage settings. */
export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSettings])
  .handler(async () => {
    const agents = await loadAgents(settings);
    const general = await settings.get(notificationGeneral);
    return {
      locale: general?.locale ?? null,
      agents: agents.map((stored) => {
        const config: ConfigValues = { ...stored.target.config };
        const saved: string[] = [];
        for (const field of secretFields(stored.target.agent)) {
          if (config[field]) saved.push(field);
          config[field] = "";
        }
        return {
          agent: stored.target.agent,
          enabled: stored.enabled,
          events: stored.events,
          config,
          saved,
        };
      }),
    };
  });

const AgentInputSchema = v.object({
  agent: v.picklist(NOTIFICATION_AGENTS),
  config: v.record(v.string(), v.union([v.string(), v.number(), v.boolean()])),
});

export const saveNotificationAgent = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(
    v.pipe(
      v.object({ ...AgentInputSchema.entries, ...AgentCommonSchema.entries }),
      v.check(
        (input) =>
          !input.enabled || input.events.length > 0 || PERSONAL_ONLY_AGENTS.includes(input.agent),
        () => m.notification_events_required(),
      ),
    ),
  )
  .handler(async ({ data }) => {
    const target = toTarget[data.agent](await withStoredSecrets(data.agent, data.config));
    await saveTarget({ enabled: data.enabled, events: data.events }, target);
    return { ok: true };
  });

/** Sends a test through an agent as typed in the form (blank secrets: the saved ones). */
export const testNotificationAgent = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(AgentInputSchema)
  .handler(async ({ data, context }) => {
    const target = toTarget[data.agent](await withStoredSecrets(data.agent, data.config));
    const result = await testAgent(
      { db, settings, fetch: globalFetch, appUrl: await getAppUrl(settings) },
      target,
      context.session.user.id,
    );
    if (result.ok) return result;
    return {
      ok: false as const,
      error:
        result.error === "no-destination" ? m.notification_test_no_destination() : result.error,
    };
  });

export const saveNotificationGeneral = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(v.object({ locale: v.picklist(locales) }))
  .handler(async ({ data }) => {
    await settings.set(notificationGeneral, data);
    return { ok: true };
  });

/** The eye button of a saved notification token (like `revealSecret`). Manage settings. */
export const revealAgentSecret = createServerFn({ method: "POST" })
  .middleware([requireSettings])
  .validator(v.object({ agent: v.picklist(NOTIFICATION_AGENTS), field: v.string() }))
  .handler(async ({ data }) => {
    if (!secretFields(data.agent).includes(data.field)) {
      setResponseStatus(400);
      throw new Error("Not a secret field");
    }
    const value = (await storedConfig(data.agent))?.[data.field];
    return { secret: typeof value === "string" && value ? value : null };
  });

/** The caller's own notification settings, and which agents are on (to offer their fields). */
export const getMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const pref = db
      .select({ notifications: userPreference.notifications })
      .from(userPreference)
      .where(eq(userPreference.userId, context.session.user.id))
      .get();
    const enabled = (await loadAgents(settings))
      .filter((a) => a.enabled)
      .map((a) => a.target.agent);
    return { prefs: withNotificationDefaults(pref?.notifications), enabledAgents: enabled };
  });

/** Saves one of the caller's channels (each tab of Profile → Settings → Notifications). */
export const saveMyNotificationChannel = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(UserNotificationChannelSchema)
  .handler(async ({ data, context }) => {
    if (data.channel === "pushover" && data.value.userKey && !data.value.appToken) {
      const admin = (await loadAgents(settings)).find(
        (a) => a.enabled && a.target.agent === "pushover",
      );
      if (!admin)
        return {
          ok: false as const,
          field: "appToken" as const,
          message: m.my_notifications_pushover_app_token_required(),
        };
    }
    const userId = context.session.user.id;
    const pref = db
      .select({ notifications: userPreference.notifications })
      .from(userPreference)
      .where(eq(userPreference.userId, userId))
      .get();
    const notifications = {
      ...withNotificationDefaults(pref?.notifications),
      [data.channel]: data.value,
    };
    db.insert(userPreference)
      .values({ userId, notifications })
      .onConflictDoUpdate({ target: userPreference.userId, set: { notifications } })
      .run();
    return { ok: true as const };
  });

/** The public VAPID key, to subscribe a device (null while Web Push is off). */
export const getPushPublicKey = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async () => {
    const agent = (await loadAgents(settings)).find((a) => a.target.agent === "webpush");
    if (!agent?.enabled) return { publicKey: null };
    return { publicKey: (await getOrCreateVapidKeys(settings)).publicKey };
  });

const SubscriptionSchema = v.object({
  endpoint: v.pipe(
    v.string(),
    v.url(),
    v.maxLength(2000),
    v.check(isPushServiceEndpoint, "Not a browser push service"),
  ),
  p256dh: v.pipe(v.string(), v.nonEmpty(), v.maxLength(200)),
  auth: v.pipe(v.string(), v.nonEmpty(), v.maxLength(200)),
});

/** Remembers this device for the caller's Web Push notifications. */
export const subscribePush = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(SubscriptionSchema)
  .handler(({ data, context }) => {
    saveSubscription(db, context.session.user.id, data);
    return { ok: true };
  });

export const unsubscribePush = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(v.object({ endpoint: v.pipe(v.string(), v.maxLength(2000)) }))
  .handler(({ data, context }) => {
    // Only the caller's own device.
    const sub = db
      .select({ userId: pushSubscription.userId })
      .from(pushSubscription)
      .where(eq(pushSubscription.endpoint, data.endpoint))
      .get();
    if (sub?.userId === context.session.user.id) removeSubscription(db, data.endpoint);
    return { ok: true };
  });
