import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";
import { generateVAPIDKeys, sendNotification } from "web-push";

import { isPushServiceEndpoint } from "#/lib/notifications";
import type { AppDatabase } from "#/server/db/client";
import { pushSubscription } from "#/server/db/schema";
import { vapidKeys } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";

import type { Outgoing, SendResult } from "./agents";

/** The VAPID keys, generated and stored the first time they're needed. */
export async function getOrCreateVapidKeys(settings: SettingsStore) {
  const stored = await settings.get(vapidKeys);
  if (stored) return stored;
  const keys = generateVAPIDKeys();
  await settings.set(vapidKeys, keys);
  return keys;
}

export function saveSubscription(
  db: AppDatabase,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
): void {
  db.insert(pushSubscription)
    .values({ userId, ...sub })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId, p256dh: sub.p256dh, auth: sub.auth },
    })
    .run();
}

export function removeSubscription(db: AppDatabase, endpoint: string): void {
  db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint)).run();
}

/**
 * Sends a notification to every device of a user. Devices the push service no
 * longer knows (404 / 410) are forgotten.
 */
export async function sendWebPush(
  { db, settings, appUrl }: { db: AppDatabase; settings: SettingsStore; appUrl: string | null },
  userId: string,
  n: Outgoing,
): Promise<SendResult[]> {
  const subscriptions = db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .all();
  if (subscriptions.length === 0) return [];
  const keys = await getOrCreateVapidKeys(settings);
  // The VAPID subject must be an https URL or a mailto: (a placeholder when served over http).
  const subject = appUrl?.startsWith("https://") ? appUrl : "mailto:storyrr@localhost.invalid";
  const payload = JSON.stringify({
    title: n.subject,
    body: n.message,
    url: n.data.url ?? "/",
    image: n.data.media?.coverUrl ?? undefined,
  });
  const results: SendResult[] = [];
  for (const sub of subscriptions) {
    if (!isPushServiceEndpoint(sub.endpoint)) {
      // Saved before endpoints were checked: never sent to.
      removeSubscription(db, sub.endpoint);
      continue;
    }
    try {
      await sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        {
          vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 86_400,
        },
      );
      results.push({ ok: true });
    } catch (error) {
      const status =
        error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : undefined;
      if (status === 404 || status === 410) removeSubscription(db, sub.endpoint);
      else results.push({ ok: false, error: `Web Push answered ${status ?? "with an error"}` });
    }
  }
  return results;
}
