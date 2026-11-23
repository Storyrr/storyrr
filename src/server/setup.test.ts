import { beforeEach, describe, expect, it } from "vitest";

import { createAuth, type Auth } from "#/server/auth/config";
import { createDatabase, type AppDatabase } from "#/server/db/client";
import { user } from "#/server/db/schema";

import { createInitialAdmin, isSetupComplete } from "./setup";

const env = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
};
const admin = { name: "Admin", email: "admin@example.com", password: "correct horse battery" };

let db: AppDatabase;
let auth: Auth;

beforeEach(() => {
  db = createDatabase(":memory:");
  auth = createAuth(db, env);
});

describe("setup", () => {
  it("is incomplete on a fresh database", async () => {
    expect(await isSetupComplete(db)).toBe(false);
  });

  it("creates the first account as an admin who can sign in", async () => {
    const result = await createInitialAdmin(db, auth, admin);
    expect(result.status).toBe("created");
    expect(await isSetupComplete(db)).toBe(true);

    const [row] = await db.select().from(user);
    expect(row).toMatchObject({ email: admin.email, role: "admin" });

    const session = await auth.api.signInEmail({
      body: { email: admin.email, password: admin.password },
    });
    expect(session.user.email).toBe(admin.email);
  });

  it("refuses to run twice", async () => {
    await createInitialAdmin(db, auth, admin);
    const second = await createInitialAdmin(db, auth, { ...admin, email: "other@example.com" });
    expect(second.status).toBe("already_done");
    expect(await db.select().from(user)).toHaveLength(1);
  });

  it("creates a single admin when submissions race", async () => {
    const results = await Promise.all(
      ["a", "b", "c"].map((id) =>
        createInitialAdmin(db, auth, { ...admin, email: `${id}@example.com` }),
      ),
    );
    expect(results.filter((r) => r.status === "created")).toHaveLength(1);
    expect(await db.select().from(user)).toHaveLength(1);
  });
});

describe("auth", () => {
  it("rejects public sign-up", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { name: "X", email: "x@example.com", password: "password123" },
      }),
    ).rejects.toThrow(/sign up is not enabled/i);
  });
});
