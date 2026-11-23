import { Badge } from "#/components/ui/badge";
import type { RequestStatus } from "#/lib/requests";
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
}: {
  status: RequestStatus;
  /** Sent, but Chaptarr only queued it until the author's metadata is ready. */
  waitingForChaptarr?: boolean;
}) {
  return (
    <Badge variant={variants[status]}>
      {waitingForChaptarr ? m.status_waiting_for_chaptarr() : statusLabels[status]()}
    </Badge>
  );
}
