import { describe, expect, it } from "vitest";

import { DEFAULT_WEBHOOK_TEMPLATE } from "#/lib/notifications";
import { fakeFetch, json, jsonBody } from "#/server/services/test-utils";

import { sendPersonal, sendShared, type Outgoing } from "./agents";

const outgoing: Outgoing = {
  event: "request_available",
  subject: "Dune <now> available",
  message: "Alice & Bob's request is ready",
  data: {
    event: "request_available",
    media: {
      type: "audiobook",
      externalId: "B07Q44JYLF",
      title: "Dune",
      coverUrl: "https://m.media-amazon.com/images/I/x.jpg",
    },
    requestId: "r1",
    requestedBy: "Alice",
    url: "https://books.example.com/media/audiobook/B07Q44JYLF",
  },
};

const ok = () => fakeFetch(() => json({}));
const down: typeof globalThis.fetch = async () => {
  throw new TypeError("fetch failed");
};
const noMentions = { mentions: [] };

describe("notification agents", () => {
  it("escapes Telegram's HTML and links the title", async () => {
    const { fetch, calls } = ok();
    await sendShared(
      { agent: "telegram", config: { botToken: "bot-secret", chatId: "-100" } },
      outgoing,
      { fetch, ...noMentions },
    );
    expect(jsonBody(calls[0]?.init)).toEqual({
      chat_id: "-100",
      parse_mode: "HTML",
      text:
        "<b>Dune &#60;now&#62; available</b>\nAlice &#38; Bob&#39;s request is ready\n" +
        '<a href="https://books.example.com/media/audiobook/B07Q44JYLF">https://books.example.com/media/audiobook/B07Q44JYLF</a>',
    });
  });

  it("sends ntfy and Gotify their own payloads, tokens included", async () => {
    const ntfy = ok();
    await sendShared(
      { agent: "ntfy", config: { url: "https://ntfy.example.com/", topic: "books", token: "t" } },
      outgoing,
      { fetch: ntfy.fetch, ...noMentions },
    );
    expect(ntfy.calls[0]?.url.href).toBe("https://ntfy.example.com/");
    expect(ntfy.calls[0]?.init?.headers).toMatchObject({ Authorization: "Bearer t" });
    expect(jsonBody(ntfy.calls[0]?.init)).toMatchObject({
      topic: "books",
      title: outgoing.subject,
      click: outgoing.data.url,
      attach: outgoing.data.media?.coverUrl,
    });

    const gotify = ok();
    await sendShared(
      { agent: "gotify", config: { url: "https://gotify.example.com", token: "a&b", priority: 7 } },
      outgoing,
      { fetch: gotify.fetch, ...noMentions },
    );
    expect(gotify.calls[0]?.url.searchParams.get("token")).toBe("a&b");
    expect(jsonBody(gotify.calls[0]?.init)).toMatchObject({
      priority: 7,
      message: outgoing.message,
    });
  });

  it("fills the webhook template with JSON-safe values", async () => {
    const { fetch, calls } = ok();
    await sendShared(
      {
        agent: "webhook",
        config: {
          url: "https://hooks.example.com",
          authHeader: "",
          template: DEFAULT_WEBHOOK_TEMPLATE,
        },
      },
      outgoing,
      { fetch, ...noMentions },
    );
    expect(JSON.stringify(jsonBody(calls[0]?.init))).toContain("Alice & Bob's request is ready");
  });

  it("sends personal channels only to recipients who set them up", async () => {
    const { fetch, calls } = ok();
    const nobody = {
      email: null,
      discordId: null,
      telegramChatId: null,
      pushoverUserKey: null,
      pushbulletToken: null,
    };
    const pushover = { agent: "pushover" as const, config: { appToken: "app", userKey: "" } };
    expect(await sendPersonal(pushover, outgoing, nobody, { fetch })).toBeNull();
    expect(
      await sendPersonal(pushover, outgoing, { ...nobody, pushoverUserKey: "u" }, { fetch }),
    ).toEqual({ ok: true });
    const body = calls[0]?.init?.body;
    const form = new URLSearchParams(typeof body === "string" ? body : "");
    expect(Object.fromEntries(form)).toMatchObject({
      token: "app",
      user: "u",
      url: outgoing.data.url,
    });
  });

  it("reports a failure with the service's answer, never the URL and its token", async () => {
    const { fetch } = fakeFetch(() => new Response("Unauthorized", { status: 401 }));
    const result = await sendShared(
      { agent: "telegram", config: { botToken: "bot-secret", chatId: "-100" } },
      outgoing,
      { fetch, ...noMentions },
    );
    expect(result).toEqual({ ok: false, error: "Telegram answered 401: Unauthorized" });

    expect(
      await sendShared(
        { agent: "slack", config: { webhookUrl: "https://hooks.slack.com/services/secret" } },
        outgoing,
        { fetch: down, ...noMentions },
      ),
    ).toEqual({ ok: false, error: "Slack is unreachable" });
  });
});
