import "@tanstack/react-start/server-only";

import { db } from "#/server/db";
import { getEnv } from "#/server/env";

import { deriveSettingsKey } from "./crypto";
import { createSettingsStore } from "./store";

export { defineSetting, type SettingDefinition, type SettingsStore } from "./store";

/** The app's settings store. */
export const settings = createSettingsStore(db, deriveSettingsKey(getEnv().BETTER_AUTH_SECRET));
