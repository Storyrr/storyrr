import "@tanstack/react-start/server-only";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { getEnv } from "#/server/env";

export const db = drizzle(getEnv().DATABASE_URL);
