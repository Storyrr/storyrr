import { describe, expect, it } from "vitest";

import { signInAgainUrl } from "./auth-errors";

describe("signInAgainUrl", () => {
  it("returns to the page the session ended on", () => {
    expect(signInAgainUrl({ pathname: "/media/ebook/42", search: "?tab=1" })).toBe(
      "/sign-in?redirect=%2Fmedia%2Febook%2F42%3Ftab%3D1",
    );
  });

  it("stays put on the sign-in pages", () => {
    expect(signInAgainUrl({ pathname: "/sign-in", search: "" })).toBeNull();
    expect(signInAgainUrl({ pathname: "/setup", search: "" })).toBeNull();
  });
});
