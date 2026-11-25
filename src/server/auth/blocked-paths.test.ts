import { describe, expect, it } from "vitest";

import { isBlockedAuthPath } from "./blocked-paths";

const at = (path: string) => `http://storyrr.test${path}`;

describe("isBlockedAuthPath", () => {
  it("closes better-auth's admin endpoints, however the path is written", () => {
    for (const path of [
      "/api/auth/admin/set-role",
      "/api/auth/admin/impersonate-user",
      "/api/auth/admin/ban-user/",
      "/api/auth//admin/remove-user",
      "/api/auth/Admin/set-role",
      "/api/auth/%61dmin/set-role",
      "/api/auth/admin",
    ]) {
      expect(isBlockedAuthPath(at(path)), path).toBe(true);
    }
  });

  it("leaves the other endpoints open", () => {
    for (const path of [
      "/api/auth/sign-in/email",
      "/api/auth/get-session",
      "/api/auth/sign-out",
      "/api/auth/administrator",
    ]) {
      expect(isBlockedAuthPath(at(path)), path).toBe(false);
    }
  });
});
