import { Link, createFileRoute, redirect } from "@tanstack/react-router";

import { ServicesSettings } from "#/components/settings/services-settings";
import { buttonVariants } from "#/components/ui/button";
import { serviceSettingsQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

/** Optional second step of the setup wizard: connect services (same forms as Settings). */
export const Route = createFileRoute("/_authed/welcome")({
  beforeLoad: ({ context }) => {
    if (!context.user.isAdmin) throw redirect({ to: "/" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceSettingsQuery()),
  head: () => ({ meta: [{ title: `${m.welcome_title()} · ${m.app_name()}` }] }),
  component: WelcomePage,
});

function WelcomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{m.welcome_title()}</h1>
        <p className="text-muted-foreground">{m.welcome_description()}</p>
      </div>
      <ServicesSettings />
      <div className="flex justify-end gap-2">
        <Link to="/" className={buttonVariants({ variant: "ghost" })}>
          {m.action_skip()}
        </Link>
        <Link to="/" className={buttonVariants()}>
          {m.action_continue()}
        </Link>
      </div>
    </div>
  );
}
