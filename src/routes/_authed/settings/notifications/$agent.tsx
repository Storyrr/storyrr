import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";

import { AgentForm } from "#/components/notifications/agent-form";
import { NOTIFICATION_AGENTS, type NotificationAgent } from "#/lib/notifications";
import { notificationSettingsQuery } from "#/lib/queries/notifications";

const isAgent = (value: string): value is NotificationAgent =>
  NOTIFICATION_AGENTS.some((agent) => agent === value);

export const Route = createFileRoute("/_authed/settings/notifications/$agent")({
  beforeLoad: ({ params }) => {
    if (!isAgent(params.agent)) throw notFound();
  },
  component: AgentPage,
});

function AgentPage() {
  const { agent } = Route.useParams();
  const { data } = useSuspenseQuery(notificationSettingsQuery());
  if (!isAgent(agent)) return null;
  const stored = data.agents.find((a) => a.agent === agent) ?? null;
  // Remount per agent so each form starts from its own values.
  return <AgentForm key={agent} agent={agent} stored={stored} />;
}
