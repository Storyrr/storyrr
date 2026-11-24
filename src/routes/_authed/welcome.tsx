import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";

import { AudibleRegionForm } from "#/components/settings/audible-region-form";
import { ChaptarrSettings } from "#/components/settings/chaptarr-settings";
import { HardcoverForm } from "#/components/settings/hardcover-form";
import { LibraryServerSettings } from "#/components/settings/library-server";
import { SettingsSection } from "#/components/settings/settings-section";
import { buttonVariants } from "#/components/ui/button";
import { serviceSettingsQuery } from "#/lib/queries/settings";
import { can } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";

/** Optional second step of the setup wizard: connect services (same forms as Settings). */
export const Route = createFileRoute("/_authed/welcome")({
  beforeLoad: ({ context }) => {
    if (!can(context.user, "manage_settings")) throw redirect({ to: "/" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceSettingsQuery()),
  head: () => ({ meta: [{ title: `${m.welcome_title()} · ${m.app_name()}` }] }),
  component: WelcomePage,
});

function WelcomePage() {
  const { data } = useSuspenseQuery(serviceSettingsQuery());
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{m.welcome_title()}</h1>
        <p className="text-muted-foreground">{m.welcome_description()}</p>
      </div>
      <div className="flex flex-col gap-12">
        <ChaptarrSettings />
        <LibraryServerSettings service="audiobookshelf" />
        <LibraryServerSettings service="kavita" />
        <LibraryServerSettings service="komga" />
        <LibraryServerSettings service="jellyfin" />
        <SettingsSection
          title={m.settings_metadata_title()}
          description={m.settings_metadata_section_description()}
        >
          <AudibleRegionForm current={data.metadata} />
          <HardcoverForm hasToken={data.hardcover.hasToken} />
        </SettingsSection>
      </div>
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
