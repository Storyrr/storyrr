import { Badge } from "#/components/ui/badge";
import type { MediaAvailability } from "#/lib/request-status";
import { m } from "#/paraglide/messages.js";

const labels: Record<Exclude<MediaAvailability, "none">, () => string> = {
  available: m.availability_available,
  requested: m.availability_requested,
  processing: m.availability_processing,
  blocked: m.availability_blocked,
};

export function AvailabilityBadge({ availability }: { availability: MediaAvailability }) {
  if (availability === "none") return null;
  if (availability === "blocked") return <Badge variant="destructive">{labels.blocked()}</Badge>;
  return (
    <Badge variant={availability === "available" ? "default" : "secondary"}>
      {labels[availability]()}
    </Badge>
  );
}
