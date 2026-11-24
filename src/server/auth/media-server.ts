import "@tanstack/react-start/server-only";
import { eq, sql } from "drizzle-orm";

import type {
  MediaServer,
  MediaServerSignInError,
  MediaServerSignInInput,
} from "#/lib/media-server-login";
import { PLACEHOLDER_EMAIL_DOMAIN } from "#/lib/emails";
import type { AppDatabase } from "#/server/db/client";
import { user, userPreference } from "#/server/db/schema";
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

const linkColumn = (server: MediaServer) =>
  server === "audiobookshelf" ? userPreference.absUserId : userPreference.kavitaUser;

/** Records which media-server account a Storyrr user is. */
export function linkAccount(
  db: AppDatabase,
  server: MediaServer,
  userId: string,
  key: string,
): void {
  const set = server === "audiobookshelf" ? { absUserId: key } : { kavitaUser: key };
  db.insert(userPreference)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: userPreference.userId, set })
    .run();
}

/** The Storyrr user linked to a media-server account, if any. */
export function linkedUserId(db: AppDatabase, server: MediaServer, key: string): string | null {
  return (
    db
      .select({ userId: userPreference.userId })
      .from(userPreference)
      .where(eq(linkColumn(server), key))
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
 * Signs in with a media-server account: the linked Storyrr user, else the one
 * with the same email (then linked), else a new account when the admin allows
 * it for that server.
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
  if (account.email) {
    const sameEmail = db
      .select({ id: user.id })
      .from(user)
      .where(eq(sql`lower(${user.email})`, account.email.toLowerCase()))
      .get();
    if (sameEmail) {
      linkAccount(db, input.server, sameEmail.id, account.key);
      return { ok: true, userId: sameEmail.id };
    }
  }
  if (!config.allowNew) return { ok: false, error: "no_account" };
  return {
    ok: true,
    create: {
      name: account.name,
      email: account.email ?? placeholderEmail(input.server, account.key),
    },
    link: (userId) => linkAccount(db, input.server, userId, account.key),
  };
}
