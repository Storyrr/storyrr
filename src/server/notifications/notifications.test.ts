import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_USER_NOTIFICATIONS,
  DEFAULT_WEBHOOK_TEMPLATE,
  withNotificationDefaults,
} from "#/lib/notifications";
import { createDatabase, type AppDatabase } from "#/server/db/client";
import { user, userPreference } from "#/server/db/schema";
import { upsertMedia } from "#/server/requests/queries";
import { createRequest, transitionRequest } from "#/server/requests/transitions";
import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { notificationAgentSettings } from "#/server/settings/definitions";
import { createSettingsStore, type SettingsStore } from "#/server/settings/store";

import { deliver, planNotification, requestEventKind } from "./index";

let db: AppDatabase;
let settings: SettingsStore;
const appUrl = "https://books.example.com";

function newRequest(autoApprove = false) {
  const mediaId = upsertMedia(db, {
    type: "audiobook",
    source: "audible",
    externalId: "B0TEST",
    title: "Dune",
    authors: ["Frank Herbert"],
    narrators: [],
    series: [],
    coverUrl: "https://images.example.com/dune.jpg",
  });
  const result = createRequest(db, {
    mediaId,
    userId: "bob",
    format: "audiobook",
    target: { service: "chaptarr", rootFolderPath: "/audiobooks" },
    autoApprove,
  });
  return result.requestId;
}

beforeEach(async () => {
  db = createDatabase(":memory:");
  settings = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
  await db.insert(user).values([
    { id: "admin", name: "Ada", email: "ada@example.com", role: "admin" },
    { id: "bob", name: "Bob", email: "bob@example.com" },
  ]);
  await db.insert(userPreference).values({
    userId: "bob",
    locale: "fr",
    notifications: {
      ...DEFAULT_USER_NOTIFICATIONS,
      discord: { discordId: "1234", events: ["request_available"] },
      pushbullet: { accessToken: "bob-token", events: ["request_declined"] },
    },
  });
});

describe("notifications", () => {
  it("names status changes", () => {
    expect(requestEventKind(null, "pending")).toBe("request_pending");
    expect(requestEventKind(null, "approved")).toBe("request_auto_approved");
    expect(requestEventKind("pending", "approved")).toBe("request_approved");
    expect(requestEventKind("approved", "submitted")).toBeNull();
  });

  it("tells request managers about new requests, and the requester about theirs", async () => {
    const requestId = newRequest();
    const pending = await planNotification(
      { db, settings, appUrl },
      { kind: "request", requestId, from: null, to: "pending", actor: "bob", message: null },
    );
    expect(pending).toMatchObject({
      data: {
        event: "request_pending",
        requestedBy: "Bob",
        url: `${appUrl}/media/audiobook/B0TEST`,
      },
      recipientIds: ["admin"],
    });

    transitionRequest(db, requestId, { to: "denied", actor: "admin", message: "Duplicate" });
    const declined = await planNotification(
      { db, settings, appUrl },
      {
        kind: "request",
        requestId,
        from: "pending",
        to: "denied",
        actor: "admin",
        message: "Duplicate",
      },
    );
    expect(declined).toMatchObject({
      data: { event: "request_declined", reason: "Duplicate" },
      recipientIds: ["bob"],
    });
  });

  it("sends through enabled agents for their events, mentioning recipients on Discord", async () => {
    const requestId = newRequest();
    await settings.set(notificationAgentSettings.discord, {
      enabled: true,
      events: ["request_available"],
      config: { webhookUrl: "https://discord.example.com/api/webhooks/1/secret", username: "" },
    });
    await settings.set(notificationAgentSettings.webhook, {
      enabled: true,
      events: ["request_pending"],
      config: {
        url: "https://hooks.example.com/storyrr",
        authHeader: "",
        template: DEFAULT_WEBHOOK_TEMPLATE,
      },
    });
    const { fetch, calls } = fakeFetch(() => json({}));
    const deps = { db, settings, appUrl, fetch };

    const planned = await planNotification(deps, {
      kind: "request",
      requestId,
      from: "submitted",
      to: "available",
      actor: "system",
      message: null,
    });
    if (!planned) throw new Error("expected a notification");
    await deliver(deps, planned);

    // Only Discord wants "available"; Bob is mentioned, the shared text uses the instance language.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.hostname).toBe("discord.example.com");
    expect(jsonBody(calls[0]?.init)).toMatchObject({
      content: "<@1234>",
      embeds: [{ title: "Now available: Dune", url: `${appUrl}/media/audiobook/B0TEST` }],
    });
  });

  it("sends to a user's own Pushbullet for their events, without an administrator agent", async () => {
    const requestId = newRequest();
    transitionRequest(db, requestId, { to: "denied", actor: "admin", message: null });
    const { fetch, calls } = fakeFetch(() => json({}));
    const deps = { db, settings, appUrl, fetch };
    const declined = await planNotification(deps, {
      kind: "request",
      requestId,
      from: "pending",
      to: "denied",
      actor: "admin",
      message: null,
    });
    if (!declined) throw new Error("expected a notification");
    await deliver(deps, declined);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.hostname).toBe("api.pushbullet.com");
    expect(calls[0]?.init?.headers).toMatchObject({ "Access-Token": "bob-token" });
  });

  it("leaves Discord mentions out for events the user's Discord channel doesn't want", async () => {
    const requestId = newRequest();
    await settings.set(notificationAgentSettings.discord, {
      enabled: true,
      events: ["request_declined"],
      config: { webhookUrl: "https://discord.example.com/api/webhooks/1/secret", username: "" },
    });
    transitionRequest(db, requestId, { to: "denied", actor: "admin", message: null });
    const { fetch, calls } = fakeFetch(() => json({}));
    const deps = { db, settings, appUrl, fetch };
    const declined = await planNotification(deps, {
      kind: "request",
      requestId,
      from: "pending",
      to: "denied",
      actor: "admin",
      message: null,
    });
    if (!declined) throw new Error("expected a notification");
    await deliver(deps, declined);

    const discord = calls.find((call) => call.url.hostname === "discord.example.com");
    expect(jsonBody(discord?.init)).not.toHaveProperty("content");
  });

  it("converts preferences saved with one shared event list", () => {
    const prefs = withNotificationDefaults({
      email: false,
      discordId: "42",
      telegramChatId: "",
      pushoverUserKey: "key",
      pushbulletToken: "",
      webpush: true,
      events: ["request_available"],
    });
    expect(prefs.email.events).toEqual([]);
    expect(prefs.webpush.events).toEqual(["request_available"]);
    expect(prefs.discord).toEqual({ discordId: "42", events: ["request_available"] });
    expect(prefs.pushover).toEqual({ appToken: "", userKey: "key", events: ["request_available"] });
  });
});
