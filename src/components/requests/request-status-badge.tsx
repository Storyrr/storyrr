import { Badge } from "#/components/ui/badge";
import type { RequestStatus } from "#/lib/requests";
import { formatPercent } from "#/lib/format";
import { m } from "#/paraglide/messages.js";

export const statusLabels: Record<RequestStatus, () => string> = {
  pending: m.status_pending,
  approved: m.status_approved,
  submitted: m.status_submitted,
  available: m.status_available,
  denied: m.status_denied,
  failed: m.status_failed,
  cancelled: m.status_cancelled,
};

const variants: Record<RequestStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  approved: "secondary",
  submitted: "secondary",
  available: "default",
  denied: "destructive",
  failed: "destructive",
  cancelled: "outline",
};

export function RequestStatusBadge({
  status,
  waitingForChaptarr = false,
  download = null,
}: {
  status: RequestStatus;
  /** Sent, but Chaptarr only queued it until the author's metadata is ready. */
  waitingForChaptarr?: boolean;
  /** Present when the book is in Chaptarr's download queue. */
  download?: { progress: number | null } | null;
}) {
  let label = statusLabels[status]();
  if (status === "submitted") {
    // A download wins: Chaptarr may have started one it first only queued.
    if (download) {
      label =
        download.progress === null
          ? m.status_downloading()
          : m.status_downloading_progress({ percent: formatPercent(download.progress) });
    } else if (waitingForChaptarr) label = m.status_waiting_for_chaptarr();
    else label = m.status_requested();
  }
  return <Badge variant={variants[status]}>{label}</Badge>;
}
