import { describe, expect, it } from "vitest";

import { expandPermissions, hasPermission, holdsMoreThan } from "./permissions";

describe("permissions", () => {
  it("gives admins everything", () => {
    const all = expandPermissions(["admin"]);
    expect(hasPermission(all, "manage_settings")).toBe(true);
  });

  it("adds what a permission implies", () => {
    const effective = expandPermissions(["manage_requests", "request_ebook"]);
    expect(effective).toContain("auto_approve_ebook");
    expect(effective).toContain("view_requests");
    expect(hasPermission(effective, "manage_users")).toBe(false);
  });

  it("tells when an account holds a permission the caller lacks", () => {
    const manager = expandPermissions(["manage_users", "request_ebook"]);
    expect(holdsMoreThan(["request_ebook"], manager)).toBe(false);
    expect(holdsMoreThan(["manage_settings"], manager)).toBe(true);
    // Implied permissions count: managing requests auto-approves.
    expect(holdsMoreThan(["manage_requests"], manager)).toBe(true);
    expect(holdsMoreThan(["manage_settings"], expandPermissions(["admin"]))).toBe(false);
  });
});
