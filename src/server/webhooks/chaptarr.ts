import "@tanstack/react-start/server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";

import { inArray } from "drizzle-orm";
import * as v from "valibot";

import type { AppDatabase } from "#/server/db/client";
import { request } from "#/server/db/schema";
import { checkAvailability } from "#/server/requests/availability";
import type { Services } from "#/server/services/factory";
import { chaptarrWebhookToken } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";

/** The webhook token, created on first use. */
export async function getOrCreateWebhookToken(store: SettingsStore): Promise<string> {
  const existing = await store.get(chaptarrWebhookToken);
  if (existing) return existing;
  const token = randomBytes(32).toString("base64url");
  await store.set(chaptarrWebhookToken, token);
  return token;
}

export async function isValidWebhookToken(
  store: SettingsStore,
  candidate: string | null,
): Promise<boolean> {
  const expected = await store.get(chaptarrWebhookToken);
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// UNVERIFIED: Readarr-style webhook payload ({ eventType, author: { id }, books: [{ id }] });
// only used to narrow which requests to re-check.
const PayloadSchema = v.looseObject({
  eventType: v.optional(v.string()),
  author: v.optional(v.looseObject({ id: v.optional(v.number()) })),
  books: v.optional(v.array(v.looseObject({ id: v.optional(v.number()) }))),
  book: v.optional(v.looseObject({ id: v.optional(v.number()) })),
});

/** Events after which a book file may have appeared. */
const IMPORT_EVENTS = new Set(["Download", "BookFileImport", "Upgrade", "Rename"]);

/**
 * Handles a webhook call: on import-like events, re-checks the affected
 * submitted requests (all of them when the payload doesn't say which).
 */
export async function handleChaptarrWebhook(
  deps: { db: AppDatabase; services: Services },
  body: unknown,
): Promise<{ checked: boolean; available: string[] }> {
  const parsed = v.safeParse(PayloadSchema, body);
  const payload = parsed.success ? parsed.output : {};
  if (payload.eventType && !IMPORT_EVENTS.has(payload.eventType))
    return { checked: false, available: [] };

  const bookIds = [payload.book?.id, ...(payload.books ?? []).map((b) => b.id)].filter(
    (id): id is number => typeof id === "number",
  );
  const authorId = payload.author?.id;
  const submitted = deps.db
    .select({ id: request.id, backendRef: request.backendRef })
    .from(request)
    .where(inArray(request.status, ["submitted"]))
    .all();
  const affected = submitted
    .filter(
      (row) =>
        (typeof row.backendRef?.chaptarrBookId === "number" &&
          bookIds.includes(row.backendRef.chaptarrBookId)) ||
        (authorId !== undefined && row.backendRef?.chaptarrAuthorId === authorId),
    )
    .map((row) => row.id);

  const available = await checkAvailability(deps, {
    actor: "webhook",
    requestIds: affected.length > 0 ? affected : undefined,
  });
  return { checked: true, available };
}
