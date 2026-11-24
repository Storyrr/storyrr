import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";

import { createAuth } from "./config";

describe("password reset", () => {
  it("emails a one-time link that sets a new password", async () => {
    const db = createDatabase(":memory:");
    const sent: { email: string; url: string }[] = [];
    const auth = createAuth(
      db,
      { BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "s".repeat(40) },
      { sendResetPassword: async ({ email, url }) => void sent.push({ email, url }) },
    );
    await auth.api.createUser({
      body: { name: "Bob", email: "bob@example.com", password: "old-password-1" },
    });

    await auth.api.requestPasswordReset({
      body: { email: "bob@example.com", redirectTo: "/reset-password" },
    });
    expect(sent).toHaveLength(1);
    const token = new URL(sent[0]?.url ?? "").pathname.split("/").at(-1) ?? "";

    await auth.api.resetPassword({ body: { token, newPassword: "new-password-1" } });
    const signedIn = await auth.api.signInEmail({
      body: { email: "bob@example.com", password: "new-password-1" },
    });
    expect(signedIn.user.email).toBe("bob@example.com");
    // Used once only.
    await expect(
      auth.api.resetPassword({ body: { token, newPassword: "another-pass-1" } }),
    ).rejects.toThrow();
  });
});
