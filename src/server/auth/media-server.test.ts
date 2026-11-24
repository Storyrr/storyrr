import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type AppDatabase } from "#/server/db/client";
import { userPreference } from "#/server/db/schema";
import { createServices } from "#/server/services/factory";
import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { connectionSettings, mediaServerSignIn } from "#/server/settings/definitions";
import { createSettingsStore, type SettingsStore } from "#/server/settings/store";

import { createAuth } from "./config";
import { resolveMediaServerSignIn } from "./media-server";

let db: AppDatabase;
let settings: SettingsStore;

// Audiobookshelf accepts "reader" / "secret" as user abs-1.
const { fetch } = fakeFetch(async (url, init) => {
  if (url.pathname === "/login") {
    const body = jsonBody(init);
    if (
      typeof body === "object" &&
      body !== null &&
      "username" in body &&
      "password" in body &&
      body.username === "reader" &&
      body.password === "secret"
    )
      return json({ user: { id: "abs-1", username: "reader", email: null, type: "user" } });
    return new Response("Invalid credentials", { status: 401 });
  }
  return json({}, 404);
});

function app() {
  const services = createServices(settings, fetch);
  return createAuth(
    db,
    { BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "s".repeat(40) },
    {
      resolveMediaServerSignIn: (input) =>
        resolveMediaServerSignIn({ db, services, settings }, input),
    },
  );
}

const signIn = (password = "secret") =>
  app().api.signInMediaServer({
    body: { server: "audiobookshelf", username: "reader", password },
    asResponse: true,
  });

beforeEach(async () => {
  db = createDatabase(":memory:");
  settings = createSettingsStore(db, deriveSettingsKey("x".repeat(32)));
  await settings.set(connectionSettings.audiobookshelf, { url: "http://abs", apiKey: "k" });
});

describe("sign in with a media server", () => {
  it("is refused while the admin hasn't turned it on", async () => {
    expect((await signIn()).status).toBe(401);
  });

  it("creates and links an account when new users are allowed, then reuses it", async () => {
    await settings.set(mediaServerSignIn, {
      audiobookshelf: { enabled: true, allowNew: true },
      kavita: { enabled: false, allowNew: false },
    });
    const first = await signIn();
    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie")).toContain("session_token");
    const links = db.select().from(userPreference).all();
    expect(links).toMatchObject([{ absUserId: "abs-1" }]);

    expect((await signIn()).status).toBe(200);
    expect(db.select().from(userPreference).all()).toHaveLength(1);
    expect((await signIn("wrong")).status).toBe(401);
  });

  it("doesn't create accounts unless allowed", async () => {
    await settings.set(mediaServerSignIn, {
      audiobookshelf: { enabled: true, allowNew: false },
      kavita: { enabled: false, allowNew: false },
    });
    expect((await signIn()).status).toBe(401);
  });
});
