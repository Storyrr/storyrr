import "@tanstack/react-start/server-only";

import { getEnv } from "#/server/env";

import { createDatabase } from "./client";

export type { AppDatabase } from "./client";

/** The app's database, migrated on first import. */
export const db = createDatabase(getEnv().DATABASE_URL);
