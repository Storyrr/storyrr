import { describe, expect, it } from "vitest";

import { createAttemptLimiter } from "./attempts";

describe("createAttemptLimiter", () => {
  it("blocks a key after too many failures, until the oldest expires", () => {
    const limiter = createAttemptLimiter({ max: 2, windowMs: 1000 });
    expect(limiter.allowed("alice", 0)).toBe(true);
    limiter.failed("alice", 0);
    limiter.failed("alice", 100);
    expect(limiter.allowed("alice", 200)).toBe(false);
    expect(limiter.allowed("bob", 200)).toBe(true);
    expect(limiter.allowed("alice", 1001)).toBe(true);
  });

  it("forgets failures after a success", () => {
    const limiter = createAttemptLimiter({ max: 1, windowMs: 1000 });
    limiter.failed("alice", 0);
    limiter.succeeded("alice");
    expect(limiter.allowed("alice", 1)).toBe(true);
  });
});
