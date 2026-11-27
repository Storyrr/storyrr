import { Badge } from "#/components/ui/badge";
import type { RequestStatus } from "#/lib/requests";
import { formatPercent } from "#/lib/format";
import { cn } from "#/lib/utils";
import { m } from "#/paraglide/messages.js";

export const statusLabels: Record<RequestStatus, () => string> = {
  pending: m.status_pending,
  approved: m.status_approved,
  submitted: m.status_submitted,
  available: m.status_available,
  denied: m.status_denied,
  failed: m.status_failed,
  cancelled: m.status_cancelled,
  removed: m.status_removed,
};

const variants: Record<RequestStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  approved: "secondary",
  submitted: "secondary",
  available: "default",
  denied: "destructive",
  failed: "destructive",
  cancelled: "outline",
  removed: "outline",
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
      const { progress } = download;
      // Like Seerr: the badge itself fills up as the download goes.
      return (
        <Badge variant="secondary" className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 bg-primary/40 transition-[width] duration-500",
              // Size unknown: the whole badge pulses instead of filling.
              progress === null && "w-full animate-pulse",
            )}
            style={progress === null ? undefined : { width: `${Math.round(progress * 100)}%` }}
          />
          <span className="relative">
            {progress === null
              ? m.status_downloading()
              : m.status_downloading_progress({ percent: formatPercent(progress) })}
          </span>
        </Badge>
      );
    }
    label = waitingForChaptarr ? m.status_waiting_for_chaptarr() : m.status_requested();
  }
  return <Badge variant={variants[status]}>{label}</Badge>;
}
