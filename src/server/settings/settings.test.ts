import { eq } from "drizzle-orm";
import * as v from "valibot";
import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type AppDatabase } from "#/server/db/client";
import { setting } from "#/server/db/schema";

import { deriveSettingsKey, seal, SettingsDecryptionError, unseal } from "./crypto";
import { createSettingsStore, defineSetting } from "./store";

const key = deriveSettingsKey("x".repeat(32));

const service = defineSetting({
  key: "test.service",
  schema: v.object({ url: v.pipe(v.string(), v.url()), apiKey: v.string() }),
  secret: true,
});
const plain = defineSetting({
  key: "test.plain",
  schema: v.object({ enabled: v.boolean() }),
  secret: false,
});

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = seal(key, "hello");
    const b = seal(key, "hello");
    expect(a.data).not.toBe(b.data);
    expect(unseal(key, a)).toBe("hello");
  });

  it("refuses a different key", () => {
    const other = deriveSettingsKey("y".repeat(32));
    expect(() => unseal(other, seal(key, "hello"))).toThrow(SettingsDecryptionError);
  });

  it("refuses tampered data", () => {
    const sealed = seal(key, "hello");
    const data = Buffer.from(sealed.data, "base64");
    data[0] = (data[0] ?? 0) ^ 1;
    expect(() => unseal(key, { ...sealed, data: data.toString("base64") })).toThrow(
      SettingsDecryptionError,
    );
  });
});

describe("settings store", () => {
  let db: AppDatabase;
  beforeEach(() => {
    db = createDatabase(":memory:");
  });

  it("returns undefined for unset settings", async () => {
    expect(await createSettingsStore(db, key).get(plain)).toBeUndefined();
  });

  it("stores secrets encrypted and reads them back", async () => {
    const store = createSettingsStore(db, key);
    const value = { url: "http://chaptarr:8789", apiKey: "secret-api-key" };
    await store.set(service, value);

    const [row] = await db.select().from(setting).where(eq(setting.key, service.key));
    expect(row?.value).not.toContain("secret-api-key");
    expect(await store.get(service)).toEqual(value);
  });

  it("stores plain settings as JSON and overwrites on set", async () => {
    const store = createSettingsStore(db, key);
    await store.set(plain, { enabled: true });
    await store.set(plain, { enabled: false });
    const [row] = await db.select().from(setting).where(eq(setting.key, plain.key));
    expect(row?.value).toBe('{"enabled":false}');
    expect(await store.get(plain)).toEqual({ enabled: false });
  });

  it("reads a secret an older version stored in clear, and seals it on the next save", async () => {
    const later = defineSetting({ ...plain, key: "test.later", secret: true, sealedLater: true });
    const store = createSettingsStore(db, key);
    await db.insert(setting).values({ key: later.key, value: JSON.stringify({ enabled: true }) });
    expect(await store.get(later)).toEqual({ enabled: true });
    await store.set(later, { enabled: false });
    const [row] = await db.select().from(setting).where(eq(setting.key, later.key));
    expect(row?.value).not.toContain("enabled");
    expect(await store.get(later)).toEqual({ enabled: false });
    // A secret that was always sealed still refuses a value in clear.
    await db.insert(setting).values({ key: service.key, value: JSON.stringify({ url: "x" }) });
    await expect(store.get(service)).rejects.toBeInstanceOf(SettingsDecryptionError);
  });

  it("validates values before writing", async () => {
    const store = createSettingsStore(db, key);
    await expect(store.set(service, { url: "not a url", apiKey: "k" })).rejects.toThrow();
    expect(await store.get(service)).toBeUndefined();
  });

  it("removes settings", async () => {
    const store = createSettingsStore(db, key);
    await store.set(plain, { enabled: true });
    await store.remove(plain);
    expect(await store.get(plain)).toBeUndefined();
  });
});
