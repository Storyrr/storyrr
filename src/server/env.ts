import "@tanstack/react-start/server-only";
import * as v from "valibot";

/**
 * Server environment, validated once with Valibot.
 *
 * Read lazily through `getEnv()` (never `process.env` at module scope): the
 * first call validates and caches, and fails fast with every problem listed.
 * This file is server-only: importing it from client code fails the build.
 */
const EnvSchema = v.object({
  NODE_ENV: v.optional(v.picklist(["development", "production", "test"]), "development"),
  /** SQLite database file, e.g. `dev.db` locally or `/data/storyrr.db` in Docker. */
  DATABASE_URL: v.pipe(v.string(), v.nonEmpty("must not be empty")),
  /** Public base URL of the app, used by better-auth for redirects and cookies. */
  BETTER_AUTH_URL: v.pipe(v.string(), v.url()),
  /** Signing/encryption secret for better-auth (and stored service credentials). */
  BETTER_AUTH_SECRET: v.pipe(v.string(), v.minLength(32, "must be at least 32 characters")),
  PORT: v.optional(
    v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(1), v.maxValue(65535)),
    "3000",
  ),
});

export type Env = v.InferOutput<typeof EnvSchema>;

/** Validates an environment record; throws one error listing every invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = v.safeParse(EnvSchema, source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${v.summarize(result.issues)}`);
  }
  return result.output;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
