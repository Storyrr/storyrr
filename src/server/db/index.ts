import "@tanstack/react-start/server-only";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { getEnv } from "#/server/env";

import { relations } from "./relations";

export const db = drizzle(getEnv().DATABASE_URL, { relations });
