import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import type { AppDatabase } from "#/server/db/client";
import { setting } from "#/server/db/schema";

import { isSealed, seal, unseal } from "./crypto";

/**
 * A typed setting: its key, its Valibot schema, and whether the whole value
 * is a secret (encrypted at rest, never sent back to the browser as-is).
 */
export type SettingDefinition<TSchema extends v.GenericSchema> = {
  key: string;
  schema: TSchema;
  secret: boolean;
  /** A secret that older versions stored in clear: such a stored value is still read. */
  sealedLater?: boolean;
};

export function defineSetting<TSchema extends v.GenericSchema>(
  definition: SettingDefinition<TSchema>,
): SettingDefinition<TSchema> {
  return definition;
}

/** Reads and writes settings; secrets are sealed with `key` before they reach the database. */
export function createSettingsStore(db: AppDatabase, key: Buffer) {
  return {
    /** The stored value, or `undefined` when unset. Throws if it no longer matches its schema. */
    async get<TSchema extends v.GenericSchema>(
      definition: SettingDefinition<TSchema>,
    ): Promise<v.InferOutput<TSchema> | undefined> {
      const [row] = await db
        .select({ value: setting.value })
        .from(setting)
        .where(eq(setting.key, definition.key));
      if (!row) return undefined;
      const stored: unknown = JSON.parse(row.value);
      // `sealedLater`: the setting was stored in clear by older versions; read
      // such a value as it is (the next save seals it).
      const sealed = definition.secret && !(definition.sealedLater && !isSealed(stored));
      const json: unknown = sealed ? JSON.parse(unseal(key, stored)) : stored;
      return v.parse(definition.schema, json);
    },

    async set<TSchema extends v.GenericSchema>(
      definition: SettingDefinition<TSchema>,
      value: v.InferInput<TSchema>,
    ): Promise<void> {
      const parsed = v.parse(definition.schema, value);
      const json = JSON.stringify(parsed);
      const stored = definition.secret ? JSON.stringify(seal(key, json)) : json;
      await db
        .insert(setting)
        .values({ key: definition.key, value: stored })
        .onConflictDoUpdate({ target: setting.key, set: { value: stored, updatedAt: new Date() } });
    },

    async remove(definition: SettingDefinition<v.GenericSchema>): Promise<void> {
      await db.delete(setting).where(eq(setting.key, definition.key));
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
