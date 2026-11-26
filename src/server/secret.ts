import "@tanstack/react-start/server-only";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { getEnv } from "./env";

/** The data folder: the database's (the Docker volume). */
export const dataDirectory = (databaseUrl: string) =>
  dirname(resolve(databaseUrl.replace(/^file:/, "")));

/**
 * The secret in `file`, created (random, readable by its owner only) when
 * missing, like Seerr does. Losing it signs everyone out and makes stored
 * service keys unreadable: it lives in the data folder, with the database.
 */
export function loadOrCreateSecret(file: string): string {
  try {
    const stored = readFileSync(file, "utf8").trim();
    if (stored.length >= 32) return stored;
  } catch {
    // Not created yet.
  }
  const secret = randomBytes(48).toString("base64url");
  mkdirSync(dirname(file), { recursive: true });
  // `wx`: never overwrite a secret another process just wrote.
  try {
    writeFileSync(file, `${secret}\n`, { mode: 0o600, flag: "wx" });
  } catch {
    // The file exists: written by another process just now, or damaged.
    const stored = readFileSync(file, "utf8").trim();
    if (stored.length < 32)
      throw new Error(
        `${file} is empty or damaged. Restore it from a backup, or delete it to start with a new ` +
          "secret (everyone signs in again and saved service keys must be re-entered).",
      );
    return stored;
  }
  return secret;
}

let cached: string | undefined;

/** BETTER_AUTH_SECRET when set, else the one generated in the data folder. */
export function authSecret(): string {
  if (!cached) {
    const env = getEnv();
    cached =
      env.BETTER_AUTH_SECRET ??
      loadOrCreateSecret(join(dataDirectory(env.DATABASE_URL), "auth-secret"));
  }
  return cached;
}
