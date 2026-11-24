import "@tanstack/react-start/server-only";

import type { IssueType } from "#/lib/issues";
import type { NotificationEvent } from "#/lib/notifications";
import type { MediaType } from "#/lib/requests";
import { m } from "#/paraglide/messages.js";
import type { Locale } from "#/paraglide/runtime.js";

/** What a notification is about, before it's put into words. */
export type NotificationData = {
  event: NotificationEvent | "test";
  media?: { type: MediaType; externalId: string; title: string; coverUrl: string | null };
  requestId?: string;
  requestedBy?: string;
  /** Deny reason or failure message. */
  reason?: string | null;
  issue?: { id: string; type: IssueType; reportedBy: string };
  comment?: { by: string; message: string };
  /** Absolute link to the title or the issue. */
  url?: string;
};

export type RenderedNotification = { subject: string; message: string };

/** The notification's title and text in a language (shared channels use the instance's). */
export function renderNotification(data: NotificationData, locale: Locale): RenderedNotification {
  const o = { locale };
  const title = data.media?.title ?? "";
  const format =
    data.media?.type === "ebook" ? m.media_type_ebook({}, o) : m.media_type_audiobook({}, o);
  const user = data.requestedBy ?? data.issue?.reportedBy ?? "";
  const issueTypes: Record<IssueType, string> = {
    language: m.issue_type_language({}, o),
    edition: m.issue_type_edition({}, o),
    content: m.issue_type_content({}, o),
    audio: m.issue_type_audio({}, o),
    other: m.issue_type_other({}, o),
  };
  const withReason = (text: string) =>
    data.reason ? m.notification_with_reason({ text, reason: data.reason }, o) : text;

  switch (data.event) {
    case "test":
      return {
        subject: m.notification_test_subject({}, o),
        message: m.notification_test_message({}, o),
      };
    case "request_pending":
      return {
        subject: m.notification_request_pending_subject({ title }, o),
        message: m.notification_request_pending_message({ user, format, title }, o),
      };
    case "request_auto_approved":
      return {
        subject: m.notification_request_auto_approved_subject({ title }, o),
        message: m.notification_request_auto_approved_message({ user, format, title }, o),
      };
    case "request_approved":
      return {
        subject: m.notification_request_approved_subject({ title }, o),
        message: m.notification_request_approved_message({ format, title }, o),
      };
    case "request_declined":
      return {
        subject: m.notification_request_declined_subject({ title }, o),
        message: withReason(m.notification_request_declined_message({ format, title }, o)),
      };
    case "request_available":
      return {
        subject: m.notification_request_available_subject({ title }, o),
        message: m.notification_request_available_message({ format, title }, o),
      };
    case "request_failed":
      return {
        subject: m.notification_request_failed_subject({ title }, o),
        message: withReason(m.notification_request_failed_message({ format, title }, o)),
      };
    case "issue_created":
      return {
        subject: m.notification_issue_created_subject({ title }, o),
        message: m.notification_issue_created_message(
          {
            user,
            type: data.issue ? issueTypes[data.issue.type] : "",
            message: data.comment?.message ?? "",
          },
          o,
        ),
      };
    case "issue_comment":
      return {
        subject: m.notification_issue_comment_subject({ title }, o),
        message: m.notification_issue_comment_message(
          { user: data.comment?.by ?? "", message: data.comment?.message ?? "" },
          o,
        ),
      };
    case "issue_resolved":
      return {
        subject: m.notification_issue_resolved_subject({ title }, o),
        message: m.notification_issue_resolved_message({ title }, o),
      };
    default:
      // issue_reopened
      return {
        subject: m.notification_issue_reopened_subject({ title }, o),
        message: m.notification_issue_reopened_message({ title }, o),
      };
  }
}
