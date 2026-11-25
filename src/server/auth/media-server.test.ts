import { beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type AppDatabase } from "#/server/db/client";
import { mediaServerAccount, user } from "#/server/db/schema";
import { createServices } from "#/server/services/factory";
import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";
import { deriveSettingsKey } from "#/server/settings/crypto";
import { connectionSettings, mediaServerSignIn } from "#/server/settings/definitions";
import { createSettingsStore, type SettingsStore } from "#/server/settings/store";

import { createAuth } from "./config";
import {
  linkedServers,
  linkOwnAccount,
  resolveMediaServerSignIn,
  unlinkAccount,
} from "./media-server";

let db: AppDatabase;
let settings: SettingsStore;
/** The email the ABS account "reader" shows (anyone can set theirs there). */
let absEmail: string | null = null;

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
      return json({ user: { id: "abs-1", username: "reader", email: absEmail, type: "user" } });
    return new Response("Invalid credentials", { status: 401 });
  }
  return json({}, 404);
});

function app() {
  const services = createServices(settings, fetch);
  return createAuth(
    db,
    { secret: "s".repeat(40), appUrl: async () => "http://localhost:3000" },
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

const ON = {
  audiobookshelf: { enabled: true, allowNew: true },
  kavita: { enabled: false, allowNew: false },
};

const deps = () => ({ db, services: createServices(settings, fetch), settings });
const credentials = (password = "secret") => ({
  server: "audiobookshelf" as const,
  username: "reader",
  password,
});

beforeEach(async () => {
  absEmail = null;
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
    const links = db.select().from(mediaServerAccount).all();
    expect(links).toMatchObject([{ server: "audiobookshelf", accountKey: "abs-1" }]);

    expect((await signIn()).status).toBe(200);
    expect(db.select().from(mediaServerAccount).all()).toHaveLength(1);
    expect((await signIn("wrong")).status).toBe(401);
  });

  it("doesn't create accounts unless allowed", async () => {
    await settings.set(mediaServerSignIn, {
      audiobookshelf: { enabled: true, allowNew: false },
      kavita: { enabled: false, allowNew: false },
    });
    expect((await signIn()).status).toBe(401);
  });

  it("never signs in to an existing account by email (the Owner's included)", async () => {
    await settings.set(mediaServerSignIn, ON);
    db.insert(user)
      .values({ id: "owner", name: "Owner", email: "owner@example.test", role: "admin" })
      .run();
    absEmail = "Owner@Example.test";

    const response = await signIn();

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ message: "email_in_use" });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(db.select().from(mediaServerAccount).all()).toEqual([]);
  });
});

describe("linking one's own media-server account", () => {
  beforeEach(() => {
    db.insert(user).values({ id: "u1", name: "Reader", email: "reader@example.test" }).run();
    db.insert(user).values({ id: "u2", name: "Other", email: "other@example.test" }).run();
  });

  it("links after checking the password, then signs in to that account", async () => {
    await settings.set(mediaServerSignIn, {
      ...ON,
      audiobookshelf: { enabled: true, allowNew: false },
    });
    expect(await linkOwnAccount(deps(), "u1", credentials("wrong"))).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await linkOwnAccount(deps(), "u1", credentials())).toEqual({ ok: true });
    expect(linkedServers(db, "u1")).toEqual(["audiobookshelf"]);
    expect((await signIn()).status).toBe(200);

    unlinkAccount(db, "audiobookshelf", "u1");
    expect(linkedServers(db, "u1")).toEqual([]);
    expect((await signIn()).status).toBe(401);
  });

  it("refuses an account already linked to someone else", async () => {
    await settings.set(mediaServerSignIn, ON);
    await linkOwnAccount(deps(), "u2", credentials());
    expect(await linkOwnAccount(deps(), "u1", credentials())).toEqual({
      ok: false,
      error: "linked_elsewhere",
    });
    expect(linkedServers(db, "u2")).toEqual(["audiobookshelf"]);
  });

  it("is refused while that server's sign-in is off", async () => {
    expect(await linkOwnAccount(deps(), "u1", credentials())).toEqual({
      ok: false,
      error: "disabled",
    });
  });
});
