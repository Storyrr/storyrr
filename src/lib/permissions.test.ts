import { describe, expect, it } from "vitest";

import { expandPermissions, hasPermission } from "./permissions";

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
});
