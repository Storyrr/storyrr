import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"] });

// Same default as src/server/env.ts.
const url = process.env.DATABASE_URL || "database/dev.db";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/server/db/schema/index.ts",
  dialect: "sqlite",
  dbCredentials: {
    url,
  },
});
