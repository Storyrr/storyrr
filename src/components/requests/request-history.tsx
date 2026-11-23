import { useQuery } from "@tanstack/react-query";

import { FormError } from "#/components/form/form-error";
import { Spinner } from "#/components/ui/spinner";
import { formatDate } from "#/lib/format";
import { requestHistoryQuery } from "#/lib/queries/requests";
import { describeRequestError } from "#/lib/request-errors";
import { m } from "#/paraglide/messages.js";

import { statusLabels } from "./request-status-badge";

function actorLabel(actor: string, actorName: string | null) {
  if (actor === "system") return m.history_actor_system();
  if (actor === "webhook") return m.history_actor_webhook();
  return actorName ?? actor;
}

export function RequestHistory({ requestId }: { requestId: string }) {
  const history = useQuery(requestHistoryQuery(requestId));
  if (history.isPending) return <Spinner />;
  if (history.isError) return <FormError message={history.error.message || m.error_generic()} />;
  return (
    <ol className="flex flex-col gap-1 text-sm">
      {history.data.map((event) => {
        const actor = actorLabel(event.actor, event.actorName);
        const message =
          event.toStatus === "failed" ? describeRequestError(event.message) : event.message;
        return (
          <li key={`${event.toStatus}-${String(event.createdAt)}`} className="flex flex-col">
            <span>
              <time
                className="text-muted-foreground"
                dateTime={new Date(event.createdAt).toISOString()}
              >
                {formatDate(new Date(event.createdAt), { dateStyle: "short", timeStyle: "short" })}
              </time>{" "}
              {event.fromStatus === null
                ? m.history_created({ actor })
                : m.history_changed({ status: statusLabels[event.toStatus](), actor })}
            </span>
            {message ? <span className="text-muted-foreground">{message}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
