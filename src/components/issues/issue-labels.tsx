import { Badge } from "#/components/ui/badge";
import type { IssueStatus, IssueType } from "#/lib/issues";
import { m } from "#/paraglide/messages.js";

export const issueTypeLabels: Record<IssueType, () => string> = {
  language: m.issue_type_language,
  edition: m.issue_type_edition,
  content: m.issue_type_content,
  audio: m.issue_type_audio,
  other: m.issue_type_other,
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return status === "open" ? (
    <Badge variant="destructive">{m.issue_status_open()}</Badge>
  ) : (
    <Badge variant="secondary">{m.issue_status_resolved()}</Badge>
  );
}
