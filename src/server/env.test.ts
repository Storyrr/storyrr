import { afterEach, describe, expect, it, vi } from "vitest";

import { getEnv, parseEnv } from "./env";

const valid = {
  DATABASE_URL: "test.db",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a minimal valid environment and applies defaults", () => {
    expect(parseEnv(valid)).toEqual({ ...valid, NODE_ENV: "development", PORT: 3000 });
  });

  it("converts PORT to a number", () => {
    expect(parseEnv({ ...valid, PORT: "8080" }).PORT).toBe(8080);
  });

  it("keeps an explicit NODE_ENV", () => {
    expect(parseEnv({ ...valid, NODE_ENV: "production" }).NODE_ENV).toBe("production");
  });

  it("ignores unrelated variables", () => {
    expect(parseEnv({ ...valid, HOME: "/root" })).not.toHaveProperty("HOME");
  });

  it.each([
    ["DATABASE_URL", { ...valid, DATABASE_URL: "" }],
    ["BETTER_AUTH_URL", { ...valid, BETTER_AUTH_URL: "not a url" }],
    ["BETTER_AUTH_SECRET", { ...valid, BETTER_AUTH_SECRET: "too-short" }],
    ["PORT", { ...valid, PORT: "70000" }],
    ["PORT", { ...valid, PORT: "abc" }],
    ["NODE_ENV", { ...valid, NODE_ENV: "staging" }],
  ])("rejects an invalid %s", (key, env) => {
    expect(() => parseEnv(env)).toThrow(key);
  });

  it("lists every invalid variable in one error", () => {
    expect(() => parseEnv({})).toThrow(
      /DATABASE_URL[\s\S]*BETTER_AUTH_URL[\s\S]*BETTER_AUTH_SECRET/,
    );
  });
});

describe("getEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads process.env once and caches the result", () => {
    vi.stubEnv("DATABASE_URL", "first.db");
    vi.stubEnv("BETTER_AUTH_URL", valid.BETTER_AUTH_URL);
    vi.stubEnv("BETTER_AUTH_SECRET", valid.BETTER_AUTH_SECRET);
    const first = getEnv();
    expect(first.DATABASE_URL).toBe("first.db");

    vi.stubEnv("DATABASE_URL", "second.db");
    expect(getEnv()).toBe(first);
  });
});
