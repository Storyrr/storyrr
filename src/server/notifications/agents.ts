import "@tanstack/react-start/server-only";
import { createTransport } from "nodemailer";

import { renderTemplate, type AgentConfig, type AgentTarget } from "#/lib/notifications";
import type { FetchFn } from "#/server/services/result";

import type { NotificationData, RenderedNotification } from "./render";

export type SendResult = { ok: true } | { ok: false; error: string };

/** A notification ready to go out: its words, link and picture. */
export type Outgoing = RenderedNotification & { data: NotificationData; event: string };

/** Someone it's personally for, with the channels they set up. */
export type Recipient = {
  email: string | null;
  discordId: string | null;
  telegramChatId: string | null;
  pushoverUserKey: string | null;
  pushbulletToken: string | null;
};

const TIMEOUT_MS = 15_000;

/** POSTs and reports failures with the service's answer, never the URL (it may hold a token). */
async function post(
  fetch: FetchFn,
  service: string,
  url: string,
  init: { headers?: Record<string, string>; body: string },
): Promise<SendResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: init.headers,
      body: init.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return { ok: true };
    const text = (await response.text().catch(() => "")).slice(0, 300);
    return { ok: false, error: `${service} answered ${response.status}${text ? `: ${text}` : ""}` };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError" ? "timed out" : "is unreachable";
    return { ok: false, error: `${service} ${reason}` };
  }
}

const json = (body: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** Brand accent (#F5B800) for embeds. */
const ACCENT = 0xf5b800;

/** Variables of the webhook template. */
export function webhookVariables(n: Outgoing): Record<string, string> {
  const d = n.data;
  return {
    event: n.event,
    subject: n.subject,
    message: n.message,
    image: d.media?.coverUrl ?? "",
    url: d.url ?? "",
    media_type: d.media?.type ?? "",
    media_title: d.media?.title ?? "",
    media_external_id: d.media?.externalId ?? "",
    request_id: d.requestId ?? "",
    requested_by: d.requestedBy ?? "",
    issue_id: d.issue?.id ?? "",
    issue_type: d.issue?.type ?? "",
    reported_by: d.issue?.reportedBy ?? "",
    comment: d.comment?.message ?? "",
  };
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Shared delivery: the agent's own destination (channel, topic, group…). */
export async function sendShared(
  target: AgentTarget,
  n: Outgoing,
  { fetch, mentions }: { fetch: FetchFn; mentions: string[] },
): Promise<SendResult | null> {
  const link = n.data.url;
  const image = n.data.media?.coverUrl ?? undefined;
  switch (target.agent) {
    case "discord": {
      const c = target.config;
      return post(
        fetch,
        "Discord",
        c.webhookUrl,
        json({
          username: c.username || "Storyrr",
          content: mentions.length > 0 ? mentions.map((id) => `<@${id}>`).join(" ") : undefined,
          allowed_mentions: { users: mentions },
          embeds: [
            {
              title: n.subject,
              description: n.message,
              url: link,
              color: ACCENT,
              thumbnail: image ? { url: image } : undefined,
            },
          ],
        }),
      );
    }
    case "slack": {
      const c = target.config;
      return post(
        fetch,
        "Slack",
        c.webhookUrl,
        json({
          // Escaped: `<!channel>` or `<https://…|label>` typed in an issue would ping or spoof.
          text: `${slackText(n.subject)}\n${slackText(n.message)}${link ? `\n${link}` : ""}`,
        }),
      );
    }
    case "telegram": {
      const c = target.config;
      return c.chatId ? telegram(fetch, c.botToken, c.chatId, n) : null;
    }
    case "ntfy": {
      const c = target.config;
      return post(fetch, "ntfy", c.url.replace(/\/+$/, ""), {
        headers: {
          "Content-Type": "application/json",
          ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}),
        },
        body: JSON.stringify({
          topic: c.topic,
          title: n.subject,
          message: n.message,
          click: link,
          attach: image,
          tags: ["books"],
        }),
      });
    }
    case "gotify": {
      const c = target.config;
      return post(
        fetch,
        "Gotify",
        `${c.url.replace(/\/+$/, "")}/message?token=${encodeURIComponent(c.token)}`,
        json({
          title: n.subject,
          message: n.message,
          priority: c.priority,
          extras: link ? { "client::notification": { click: { url: link } } } : undefined,
        }),
      );
    }
    case "pushover": {
      const c = target.config;
      return c.userKey ? sendPushover(fetch, c.appToken, c.userKey, n) : null;
    }
    case "pushbullet": {
      const c = target.config;
      return sendPushbullet(fetch, c.accessToken, n, c.channelTag || undefined);
    }
    case "webhook": {
      const c = target.config;
      return post(fetch, "Webhook", c.url, {
        headers: {
          "Content-Type": "application/json",
          ...(c.authHeader ? { Authorization: c.authHeader } : {}),
        },
        body: renderTemplate(c.template, webhookVariables(n)),
      });
    }
    default:
      // Email: no shared destination, it goes to each recipient.
      return null;
  }
}

/** Personal delivery to one recipient through the agent, when they set it up. */
export async function sendPersonal(
  target: AgentTarget,
  n: Outgoing,
  to: Recipient,
  { fetch }: { fetch: FetchFn },
): Promise<SendResult | null> {
  switch (target.agent) {
    case "email": {
      return to.email ? sendEmail(target.config, to.email, n) : null;
    }
    case "telegram":
      return to.telegramChatId
        ? telegram(fetch, target.config.botToken, to.telegramChatId, n)
        : null;
    case "pushover":
      return to.pushoverUserKey
        ? sendPushover(fetch, target.config.appToken, to.pushoverUserKey, n)
        : null;
    case "pushbullet":
      return to.pushbulletToken ? sendPushbullet(fetch, to.pushbulletToken, n) : null;
    default:
      // Discord mentions go in the shared message; the others have no personal target.
      return null;
  }
}

function telegram(fetch: FetchFn, botToken: string, chatId: string, n: Outgoing) {
  const text = `<b>${escapeHtml(n.subject)}</b>\n${escapeHtml(n.message)}${
    n.data.url ? `\n<a href="${escapeHtml(n.data.url)}">${escapeHtml(n.data.url)}</a>` : ""
  }`;
  return post(
    fetch,
    "Telegram",
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    json({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  );
}

export function sendPushover(fetch: FetchFn, appToken: string, userKey: string, n: Outgoing) {
  const body = new URLSearchParams({
    token: appToken,
    user: userKey,
    title: n.subject,
    message: n.message,
  });
  if (n.data.url) body.set("url", n.data.url);
  return post(fetch, "Pushover", "https://api.pushover.net/1/messages.json", {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

export function sendPushbullet(
  fetch: FetchFn,
  accessToken: string,
  n: Outgoing,
  channelTag?: string,
) {
  return post(fetch, "Pushbullet", "https://api.pushbullet.com/v2/pushes", {
    headers: { "Content-Type": "application/json", "Access-Token": accessToken },
    body: JSON.stringify({
      type: n.data.url ? "link" : "note",
      title: n.subject,
      body: n.message,
      url: n.data.url,
      channel_tag: channelTag,
    }),
  });
}

/** Sends an email through the configured SMTP server (also used for password resets). */
export async function sendEmail(
  config: AgentConfig<"email">,
  to: string,
  n: Pick<Outgoing, "subject" | "message"> & { data: Pick<NotificationData, "url" | "media"> },
): Promise<SendResult> {
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: TIMEOUT_MS,
  });
  const link = n.data.url;
  const image = n.data.media?.coverUrl;
  const html = `<!doctype html><html><body style="margin:0;background:#17140F;font-family:system-ui,sans-serif;color:#FFF7E0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#221E17;border-radius:12px;padding:24px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:8px">story<span style="color:#F5B800">rr</span></td></tr>
${image ? `<tr><td style="padding:8px 0"><img src="${escapeHtml(image)}" alt="" width="120" style="border-radius:8px"></td></tr>` : ""}
<tr><td style="font-size:18px;font-weight:600;padding:8px 0">${escapeHtml(n.subject)}</td></tr>
<tr><td style="font-size:15px;line-height:1.5;color:#E8DFC8">${escapeHtml(n.message)}</td></tr>
${link ? `<tr><td style="padding-top:20px"><a href="${escapeHtml(link)}" style="background:#F5B800;color:#17140F;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px;display:inline-block">Storyrr</a></td></tr>` : ""}
</table></td></tr></table></body></html>`;
  try {
    await transport.sendMail({
      from: config.fromName
        ? { name: config.fromName, address: config.fromAddress }
        : config.fromAddress,
      to,
      subject: n.subject,
      text: `${n.message}${link ? `\n\n${link}` : ""}`,
      html,
    });
    return { ok: true };
  } catch (error) {
    // nodemailer's messages describe the SMTP exchange, without credentials.
    return { ok: false, error: `SMTP: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Text with Slack's control characters escaped (its own rule: only `&`, `<` and `>`). */
function slackText(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
