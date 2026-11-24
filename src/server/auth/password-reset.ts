import "@tanstack/react-start/server-only";

import { m } from "#/paraglide/messages.js";
import { sendEmail } from "#/server/notifications/agents";
import { settings } from "#/server/settings";
import { notificationAgentSettings } from "#/server/settings/definitions";

/** Whether "Forgot password?" can work: the Email agent is set up and enabled. */
export async function passwordResetAvailable(): Promise<boolean> {
  return (await settings.get(notificationAgentSettings.email))?.enabled === true;
}

/**
 * Sends the reset link through the Email agent's SMTP server, in the language
 * of the request. Without email set up, nothing is sent (the form still answers
 * the same way, so it never tells whether an address has an account).
 */
export async function sendPasswordResetEmail({
  email,
  name,
  url,
}: {
  email: string;
  name: string;
  url: string;
}): Promise<void> {
  const agent = await settings.get(notificationAgentSettings.email);
  if (!agent?.enabled) {
    console.warn("[auth] password reset requested, but the Email agent isn't set up");
    return;
  }
  const result = await sendEmail(agent.config, email, {
    subject: m.password_reset_email_subject(),
    message: m.password_reset_email_message({ name }),
    data: { url },
  });
  if (!result.ok) console.warn(`[auth] password reset email failed: ${result.error}`);
}
