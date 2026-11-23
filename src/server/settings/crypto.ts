import "@tanstack/react-start/server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import * as v from "valibot";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

/** Encrypted payload as stored in the database (base64 fields). */
const SealedSchema = v.object({
  v: v.literal(1),
  iv: v.string(),
  tag: v.string(),
  data: v.string(),
});
export type Sealed = v.InferOutput<typeof SealedSchema>;

/**
 * Derives the settings encryption key from the auth secret. Changing
 * BETTER_AUTH_SECRET makes stored secrets unreadable: they must be re-entered.
 */
export function deriveSettingsKey(authSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", authSecret, "storyrr", "settings-encryption-v1", 32));
}

export function seal(key: Buffer, plaintext: string): Sealed {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export class SettingsDecryptionError extends Error {
  constructor() {
    super("Stored secret can't be decrypted (was BETTER_AUTH_SECRET changed?)");
    this.name = "SettingsDecryptionError";
  }
}

export function unseal(key: Buffer, sealed: unknown): string {
  const parsed = v.safeParse(SealedSchema, sealed);
  if (!parsed.success) throw new SettingsDecryptionError();
  const { iv, tag, data } = parsed.output;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new SettingsDecryptionError();
  }
}
