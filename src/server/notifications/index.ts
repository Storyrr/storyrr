import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";

import {
  withNotificationDefaults,
  type AgentTarget,
  type NotificationEvent,
} from "#/lib/notifications";
import { hasPermission, type Permission } from "#/lib/permissions";
import { baseLocale, isLocale, type Locale } from "#/paraglide/runtime.js";
import type { AppDatabase } from "#/server/db/client";
import {
  issue,
  issueComment,
  media,
  request,
  requestWatcher,
  user,
  userPreference,
} from "#/server/db/schema";
import { onAppEvent, type AppEvent } from "#/server/events";
import { permissionsOf } from "#/server/permissions";
import type { FetchFn } from "#/server/services/result";
import { notificationAgentSettings, notificationGeneral } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";

import { sendPersonal, sendShared, type Outgoing, type Recipient, type SendResult } from "./agents";
import { renderNotification, type NotificationData } from "./render";
import { sendWebPush } from "./webpush";

export type NotifyDeps = {
  db: AppDatabase;
  settings: SettingsStore;
  fetch: FetchFn;
  /** Public URL, for links back to Storyrr. */
  appUrl: string;
};

type Planned = { data: NotificationData & { event: NotificationEvent }; recipientIds: string[] };

/** The notification an app event calls for, and who it's personally for (null: none). */
export async function planNotification(
  deps: Pick<NotifyDeps, "db" | "settings" | "appUrl">,
  event: AppEvent,
): Promise<Planned | null> {
  const { db } = deps;
  if (event.kind === "request") {
    const kind = requestEventKind(event.from, event.to);
    if (!kind) return null;
    const row = db
      .select({ request, media, requester: { id: user.id, name: user.name } })
      .from(request)
      .innerJoin(media, eq(media.id, request.mediaId))
      .innerJoin(user, eq(user.id, request.userId))
      .where(eq(request.id, event.requestId))
      .get();
    if (!row) return null;
    const data: Planned["data"] = {
      event: kind,
      media: mediaOf(row.media),
      requestId: row.request.id,
      requestedBy: row.requester.name,
      reason: event.message,
      url: `${deps.appUrl}/media/${row.media.type}/${encodeURIComponent(row.media.externalId)}`,
    };
    if (kind === "request_pending" || kind === "request_auto_approved") {
      const managers = await usersWith(deps, "manage_requests");
      return { data, recipientIds: managers.filter((id) => id !== row.requester.id) };
    }
    const watchers = db
      .select({ userId: requestWatcher.userId })
      .from(requestWatcher)
      .where(eq(requestWatcher.requestId, row.request.id))
      .all()
      .map((w) => w.userId);
    return { data, recipientIds: [row.requester.id, ...watchers] };
  }

  const found = db
    .select({ issue, media, reporter: { id: user.id, name: user.name } })
    .from(issue)
    .innerJoin(media, eq(media.id, issue.mediaId))
    .innerJoin(user, eq(user.id, issue.userId))
    .where(eq(issue.id, event.issueId))
    .get();
  if (!found) return null;
  const base = {
    media: mediaOf(found.media),
    issue: { id: found.issue.id, type: found.issue.type, reportedBy: found.reporter.name },
    url: `${deps.appUrl}/issues/${found.issue.id}`,
  };
  const managers = () => usersWith(deps, "manage_issues");
  switch (event.kind) {
    case "issue_created": {
      const first = db
        .select({ message: issueComment.message })
        .from(issueComment)
        .where(eq(issueComment.issueId, found.issue.id))
        .get();
      return {
        data: {
          ...base,
          event: "issue_created",
          comment: { by: found.reporter.name, message: first?.message ?? "" },
        },
        recipientIds: (await managers()).filter((id) => id !== event.userId),
      };
    }
    case "issue_comment": {
      const by = db.select({ name: user.name }).from(user).where(eq(user.id, event.userId)).get();
      return {
        data: {
          ...base,
          event: "issue_comment",
          comment: { by: by?.name ?? "", message: event.message },
        },
        recipientIds: [found.reporter.id, ...(await managers())].filter(
          (id) => id !== event.userId,
        ),
      };
    }
    default:
      // issue_status
      return {
        data: { ...base, event: event.status === "resolved" ? "issue_resolved" : "issue_reopened" },
        recipientIds: [found.reporter.id],
      };
  }
}

function mediaOf(row: typeof media.$inferSelect) {
  return { type: row.type, externalId: row.externalId, title: row.title, coverUrl: row.coverUrl };
}

/** Which notification a status change is, if any. */
export function requestEventKind(from: string | null, to: string): NotificationEvent | null {
  if (from === null) return to === "approved" ? "request_auto_approved" : "request_pending";
  if (to === "approved" && from === "pending") return "request_approved";
  if (to === "denied") return "request_declined";
  if (to === "available") return "request_available";
  if (to === "failed") return "request_failed";
  return null;
}

/** Ids of the (non-banned) users holding a permission. */
async function usersWith(
  { db, settings }: Pick<NotifyDeps, "db" | "settings">,
  permission: Permission,
): Promise<string[]> {
  const users = db.select({ id: user.id, role: user.role, banned: user.banned }).from(user).all();
  const ids: string[] = [];
  for (const u of users) {
    if (u.banned) continue;
    if (hasPermission(await permissionsOf({ db, settings }, u), permission)) ids.push(u.id);
  }
  return ids;
}

type RecipientInfo = Recipient & {
  id: string;
  locale: Locale;
  events: readonly NotificationEvent[];
  webpush: boolean;
};

function recipientsFor(db: AppDatabase, ids: readonly string[]): RecipientInfo[] {
  const unique = [...new Set(ids)];
  return unique.flatMap((id) => {
    const row = db
      .select({ email: user.email, banned: user.banned, pref: userPreference })
      .from(user)
      .leftJoin(userPreference, eq(userPreference.userId, user.id))
      .where(eq(user.id, id))
      .get();
    if (!row || row.banned) return [];
    const prefs = withNotificationDefaults(row.pref?.notifications);
    const locale = row.pref?.locale && isLocale(row.pref.locale) ? row.pref.locale : null;
    return [
      {
        id,
        locale: locale ?? baseLocale,
        events: prefs.events,
        email: prefs.email ? row.email : null,
        discordId: prefs.discordId || null,
        telegramChatId: prefs.telegramChatId || null,
        pushoverUserKey: prefs.pushoverUserKey || null,
        pushbulletToken: prefs.pushbulletToken || null,
        webpush: prefs.webpush,
      },
    ];
  });
}

type StoredAgent = { enabled: boolean; events: NotificationEvent[]; target: AgentTarget };

const tag = (
  stored: { enabled: boolean; events: NotificationEvent[] } | undefined,
  target: AgentTarget | null,
): StoredAgent[] =>
  stored && target ? [{ enabled: stored.enabled, events: stored.events, target }] : [];

/** Every configured agent with its settings (one typed read per agent). */
export async function loadAgents(settings: SettingsStore): Promise<StoredAgent[]> {
  const s = notificationAgentSettings;
  const [
    email,
    discord,
    slack,
    telegram,
    ntfy,
    gotify,
    pushover,
    pushbullet,
    webhook,
    webpushAgent,
  ] = await Promise.all([
    settings.get(s.email),
    settings.get(s.discord),
    settings.get(s.slack),
    settings.get(s.telegram),
    settings.get(s.ntfy),
    settings.get(s.gotify),
    settings.get(s.pushover),
    settings.get(s.pushbullet),
    settings.get(s.webhook),
    settings.get(s.webpush),
  ]);
  return [
    ...tag(email, email ? { agent: "email", config: email.config } : null),
    ...tag(discord, discord ? { agent: "discord", config: discord.config } : null),
    ...tag(slack, slack ? { agent: "slack", config: slack.config } : null),
    ...tag(telegram, telegram ? { agent: "telegram", config: telegram.config } : null),
    ...tag(ntfy, ntfy ? { agent: "ntfy", config: ntfy.config } : null),
    ...tag(gotify, gotify ? { agent: "gotify", config: gotify.config } : null),
    ...tag(pushover, pushover ? { agent: "pushover", config: pushover.config } : null),
    ...tag(pushbullet, pushbullet ? { agent: "pushbullet", config: pushbullet.config } : null),
    ...tag(webhook, webhook ? { agent: "webhook", config: webhook.config } : null),
    ...tag(webpushAgent, webpushAgent ? { agent: "webpush", config: webpushAgent.config } : null),
  ];
}

async function sharedLocale(settings: SettingsStore): Promise<Locale> {
  return (await settings.get(notificationGeneral))?.locale ?? baseLocale;
}

const outgoing = (data: NotificationData, locale: Locale): Outgoing => ({
  ...renderNotification(data, locale),
  data,
  event: data.event,
});

/** Sends a planned notification through every enabled agent that wants its event. */
export async function deliver(deps: NotifyDeps, planned: Planned): Promise<void> {
  const recipients = recipientsFor(deps.db, planned.recipientIds).filter((r) =>
    r.events.includes(planned.data.event),
  );
  const shared = outgoing(planned.data, await sharedLocale(deps.settings));
  for (const stored of await loadAgents(deps.settings)) {
    if (!stored.enabled || !stored.events.includes(planned.data.event)) continue;
    const results = await sendThrough(deps, stored.target, shared, recipients, (r) =>
      outgoing(planned.data, r.locale),
    );
    for (const result of results)
      if (!result.ok) console.warn(`[notifications] ${stored.target.agent}: ${result.error}`);
  }
}

async function sendThrough(
  deps: NotifyDeps,
  target: AgentTarget,
  shared: Outgoing,
  recipients: readonly RecipientInfo[],
  personal: (r: RecipientInfo) => Outgoing,
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  if (target.agent === "webpush") {
    // Personal only: each recipient's devices.
    for (const recipient of recipients)
      if (recipient.webpush)
        results.push(...(await sendWebPush(deps, recipient.id, personal(recipient))));
    return results;
  }
  const mentions = recipients.flatMap((r) => (r.discordId ? [r.discordId] : []));
  const sharedResult = await sendShared(target, shared, { fetch: deps.fetch, mentions });
  if (sharedResult) results.push(sharedResult);
  for (const recipient of recipients) {
    const result = await sendPersonal(target, personal(recipient), recipient, deps);
    if (result) results.push(result);
  }
  return results;
}

/**
 * Settings → Notifications "Test": sends a test through one agent, to its
 * shared destination and to the admin testing it. Errors come back for the form.
 */
export async function testAgent(
  deps: NotifyDeps,
  target: AgentTarget,
  testerId: string,
): Promise<SendResult> {
  const data: NotificationData = { event: "test", url: deps.appUrl };
  const [tester] = recipientsFor(deps.db, [testerId]);
  const recipients = tester
    ? [{ ...tester, email: tester.email ?? emailOf(deps.db, testerId) }]
    : [];
  const results = await sendThrough(
    deps,
    target,
    outgoing(data, await sharedLocale(deps.settings)),
    recipients,
    (r) => outgoing(data, r.locale),
  );
  return (
    results.find((r) => !r.ok) ??
    (results.length > 0 ? { ok: true } : { ok: false, error: "no-destination" })
  );
}

function emailOf(db: AppDatabase, id: string): string | null {
  return db.select({ email: user.email }).from(user).where(eq(user.id, id)).get()?.email ?? null;
}

declare global {
  // Subscribed once per process, even across dev HMR.
  var storyrrNotifications: boolean | undefined;
}

/** Sends notifications for request and issue changes (started by the server entry). */
export function startNotifications(deps: () => NotifyDeps): void {
  if (globalThis.storyrrNotifications) return;
  globalThis.storyrrNotifications = true;
  onAppEvent((event) => {
    // After the write that emitted it; never blocks or fails the request.
    void (async () => {
      const d = deps();
      const planned = await planNotification(d, event);
      if (planned) await deliver(d, planned);
    })().catch((error: unknown) => console.error("[notifications] failed:", error));
  });
}
