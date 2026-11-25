import { describe, expect, it } from "vitest";

import { createDatabase } from "#/server/db/client";

import { createAuth } from "./config";
import { linkOnAppUrl, requestOrigin, secureCookiesOnHttps } from "./origins";

const APP_URL = "https://books.example.com";

/** A sign-in POST as a browser sends it: to `url`, from the page at `origin`. */
const signIn = (url: string, origin: string, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...headers },
    body: JSON.stringify({ email: "bob@example.com", password: "password-1" }),
  });

async function app() {
  const sent: string[] = [];
  const auth = createAuth(
    createDatabase(":memory:"),
    { secret: "s".repeat(40), appUrl: async () => APP_URL },
    { sendResetPassword: async ({ url }) => void sent.push(url) },
  );
  await auth.api.createUser({
    body: { name: "Bob", email: "bob@example.com", password: "password-1" },
  });
  return { auth, sent };
}

describe("addresses Storyrr is reached at", () => {
  it("signs in on the LAN over http, and through a tunnel over https", async () => {
    const { auth } = await app();

    const lan = await auth.handler(
      signIn("http://192.168.1.10:3000/api/auth/sign-in/email", "http://192.168.1.10:3000"),
    );
    expect(lan.status).toBe(200);
    // Plain http: a Secure cookie would be dropped by the browser.
    expect(lan.headers.getSetCookie().join()).not.toMatch(/secure/i);

    // A tunnel serves https and talks http to Storyrr, saying so in X-Forwarded-Proto.
    const tunnel = await auth.handler(
      signIn("http://books.example.com/api/auth/sign-in/email", APP_URL, {
        "x-forwarded-proto": "https",
      }),
    );
    expect(tunnel.status).toBe(200);
  });

  it("refuses a sign-in posted from another site", async () => {
    const { auth } = await app();
    const response = await auth.handler(
      signIn("http://192.168.1.10:3000/api/auth/sign-in/email", "https://evil.example"),
    );
    expect(response.status).toBe(403);
  });

  it("puts reset links on the application URL, whatever Host the request claims", async () => {
    const { auth, sent } = await app();
    await auth.handler(
      new Request("http://evil.example/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://evil.example" },
        body: JSON.stringify({ email: "bob@example.com", redirectTo: "/reset-password" }),
      }),
    );
    expect(sent).toHaveLength(1);
    expect(new URL(sent[0] ?? "").origin).toBe(APP_URL);
  });
});

const response = () =>
  new Response(null, {
    headers: [
      ["set-cookie", "a=1; Path=/; HttpOnly"],
      ["set-cookie", "b=2; Secure"],
    ],
  });

describe("request origins", () => {
  it("follows the proxy's forwarded host and protocol", () => {
    const behindProxy = new Request("http://storyrr:3000/", {
      headers: { "x-forwarded-host": "books.example.com", "x-forwarded-proto": "https, http" },
    });
    expect(requestOrigin(behindProxy)).toBe(APP_URL);
    expect(requestOrigin(new Request("http://192.168.1.10:3000/x"))).toBe(
      "http://192.168.1.10:3000",
    );
    expect(
      requestOrigin(new Request("http://a/", { headers: { "x-forwarded-proto": "javascript" } })),
    ).toBeNull();
  });

  it("moves a link to the application URL", () => {
    expect(
      linkOnAppUrl("http://evil.example/api/auth/reset-password/t?callbackURL=%2Fr", APP_URL),
    ).toBe(`${APP_URL}/api/auth/reset-password/t?callbackURL=%2Fr`);
  });

  it("marks cookies Secure on HTTPS requests only", () => {
    const https = secureCookiesOnHttps(
      new Request("http://storyrr/", { headers: { "x-forwarded-proto": "https" } }),
      response(),
    );
    expect(https.headers.getSetCookie()).toEqual(["a=1; Path=/; HttpOnly; Secure", "b=2; Secure"]);
    const http = secureCookiesOnHttps(new Request("http://192.168.1.10/"), response());
    expect(http.headers.getSetCookie()).toEqual(["a=1; Path=/; HttpOnly", "b=2; Secure"]);
  });
});
