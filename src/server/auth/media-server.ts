import "@tanstack/react-start/server-only";
import { and, eq, sql } from "drizzle-orm";

import {
  MEDIA_SERVERS,
  type MediaServer,
  type MediaServerSignInError,
  type MediaServerSignInInput,
} from "#/lib/media-server-login";
import { PLACEHOLDER_EMAIL_DOMAIN } from "#/lib/emails";
import type { AppDatabase } from "#/server/db/client";
import { mediaServerAccount, user } from "#/server/db/schema";
import type { Services } from "#/server/services/factory";
import { mediaServerSignIn } from "#/server/settings/definitions";
import type { SettingsStore } from "#/server/settings/store";

export type MediaServerDeps = { db: AppDatabase; services: Services; settings: SettingsStore };

/** Who signed in on the media server: their id there, name and email (if any). */
type ServerAccount = { key: string; name: string; email: string | null };

/** What to do once the media server accepted the credentials. */
export type MediaServerResolution =
  | { ok: true; userId: string }
  | { ok: true; create: { name: string; email: string }; link: (userId: string) => void }
  | { ok: false; error: MediaServerSignInError };

/** Records which media-server account a Storyrr user is (replacing an earlier link). */
export function linkAccount(
  db: AppDatabase,
  server: MediaServer,
  userId: string,
  key: string,
): void {
  db.transaction((tx) => {
    tx.delete(mediaServerAccount)
      .where(and(eq(mediaServerAccount.server, server), eq(mediaServerAccount.userId, userId)))
      .run();
    tx.insert(mediaServerAccount)
      .values({ server, accountKey: key, userId })
      .onConflictDoUpdate({
        target: [mediaServerAccount.server, mediaServerAccount.accountKey],
        set: { userId },
      })
      .run();
  });
}

/** The Storyrr user linked to a media-server account, if any. */
export function linkedUserId(db: AppDatabase, server: MediaServer, key: string): string | null {
  return (
    db
      .select({ userId: mediaServerAccount.userId })
      .from(mediaServerAccount)
      .where(and(eq(mediaServerAccount.server, server), eq(mediaServerAccount.accountKey, key)))
      .get()?.userId ?? null
  );
}

/** Placeholder email for accounts the media server has none for (better-auth requires one). */
export const placeholderEmail = (server: MediaServer, key: string) =>
  `${key.toLowerCase().replaceAll(/[^a-z0-9._-]/g, "-")}@${server}${PLACEHOLDER_EMAIL_DOMAIN}`;

async function checkCredentials(
  services: Services,
  { server, username, password }: MediaServerSignInInput,
): Promise<ServerAccount | MediaServerSignInError> {
  if (server === "audiobookshelf") {
    const abs = await services.audiobookshelf();
    if (!abs) return "disabled";
    const result = await abs.login(username, password);
    if (!result.ok) return result.error.kind === "retryable" ? "unreachable" : "invalid";
    return { key: result.value.id, name: result.value.username, email: result.value.email ?? null };
  }
  if (server === "jellyfin") {
    const jellyfin = await services.jellyfin();
    if (!jellyfin) return "disabled";
    const result = await jellyfin.login(username, password);
    if (!result.ok) return result.error.kind === "retryable" ? "unreachable" : "invalid";
    // Jellyfin keeps no email: matched by link only (or created when allowed).
    return { key: result.value.Id, name: result.value.Name, email: null };
  }
  if (server === "komga") {
    const komga = await services.komga();
    if (!komga) return "disabled";
    // Komga signs in with the account's email.
    const result = await komga.login(username, password);
    if (!result.ok) return result.error.kind === "retryable" ? "unreachable" : "invalid";
    return {
      key: result.value.id,
      name: result.value.email.split("@")[0] ?? result.value.email,
      email: result.value.email,
    };
  }
  const kavita = await services.kavita();
  if (!kavita) return "disabled";
  const result = await kavita.login(username, password);
  if (!result.ok) return result.error.kind === "retryable" ? "unreachable" : "invalid";
  return {
    key: result.value.username.toLowerCase(),
    name: result.value.username,
    email: result.value.email ?? null,
  };
}

/**
 * Signs in with a media-server account: the Storyrr user linked to it, else a
 * new account when the admin allows it for that server. Never by email: a
 * media-server user can set any email there, the Owner's included (the
 * account takeover Seerr avoids the same way for Jellyfin). Existing users
 * link their account from their settings instead.
 */
export async function resolveMediaServerSignIn(
  { db, services, settings }: MediaServerDeps,
  input: MediaServerSignInInput,
): Promise<MediaServerResolution> {
  const config = (await settings.get(mediaServerSignIn))?.[input.server];
  if (!config?.enabled) return { ok: false, error: "disabled" };
  const account = await checkCredentials(services, input);
  if (typeof account === "string") return { ok: false, error: account };

  const linked = linkedUserId(db, input.server, account.key);
  if (linked) return { ok: true, userId: linked };
  if (!config.allowNew) return { ok: false, error: "no_account" };
  if (account.email && emailInUse(db, account.email)) return { ok: false, error: "email_in_use" };
  return {
    ok: true,
    create: {
      name: account.name,
      email: account.email ?? placeholderEmail(input.server, account.key),
    },
    link: (userId) => linkAccount(db, input.server, userId, account.key),
  };
}

function emailInUse(db: AppDatabase, email: string): boolean {
  return Boolean(
    db
      .select({ id: user.id })
      .from(user)
      .where(eq(sql`lower(${user.email})`, email.toLowerCase()))
      .get(),
  );
}

/**
 * Links the signed-in user to their media-server account, once its password
 * proves it's theirs. Only for servers whose sign-in is on.
 */
export async function linkOwnAccount(
  { db, services, settings }: MediaServerDeps,
  userId: string,
  input: MediaServerSignInInput,
): Promise<{ ok: true } | { ok: false; error: MediaServerSignInError }> {
  if (!(await settings.get(mediaServerSignIn))?.[input.server]?.enabled)
    return { ok: false, error: "disabled" };
  const account = await checkCredentials(services, input);
  if (typeof account === "string") return { ok: false, error: account };
  const linked = linkedUserId(db, input.server, account.key);
  if (linked && linked !== userId) return { ok: false, error: "linked_elsewhere" };
  linkAccount(db, input.server, userId, account.key);
  return { ok: true };
}

/** Removes a user's link to a media server (they sign in with their Storyrr password again). */
export function unlinkAccount(db: AppDatabase, server: MediaServer, userId: string): void {
  db.delete(mediaServerAccount)
    .where(and(eq(mediaServerAccount.server, server), eq(mediaServerAccount.userId, userId)))
    .run();
}

/** The media servers a user is linked to. */
export function linkedServers(db: AppDatabase, userId: string): MediaServer[] {
  return db
    .select({ server: mediaServerAccount.server })
    .from(mediaServerAccount)
    .where(eq(mediaServerAccount.userId, userId))
    .all()
    .flatMap((row) => MEDIA_SERVERS.filter((server) => server === row.server));
}
