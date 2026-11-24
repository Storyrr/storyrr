import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConicalIcon } from "lucide-react";

import { AudibleRegionForm } from "#/components/settings/audible-region-form";
import { HardcoverForm } from "#/components/settings/hardcover-form";
import { SettingsSection } from "#/components/settings/settings-section";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Spinner } from "#/components/ui/spinner";
import { testMetadataProviders } from "#/functions/settings.functions";
import { serviceSettingsQuery } from "#/lib/queries/settings";
import type { ExternalService } from "#/lib/schemas/settings";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/settings/metadata")({
  loader: ({ context }) => context.queryClient.ensureQueryData(serviceSettingsQuery()),
  head: () => ({ meta: [{ title: `${m.settings_tab_metadata()} · ${m.app_name()}` }] }),
  component: MetadataPage,
});

type Status = { ok: true } | { ok: false; error: Parameters<typeof serviceErrorMessage>[1] };

function ProviderStatus({
  name,
  service,
  status,
  configured,
}: {
  name: string;
  service: ExternalService;
  status: Status | null | undefined;
  configured: boolean;
}) {
  let badge: React.ReactNode = <Badge variant="outline">{m.metadata_untested()}</Badge>;
  if (!configured) badge = <Badge variant="outline">{m.metadata_not_set_up()}</Badge>;
  else if (status?.ok) badge = <Badge>{m.metadata_working()}</Badge>;
  else if (status) badge = <Badge variant="destructive">{m.metadata_failing()}</Badge>;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 text-sm">
        <span className="w-24 font-medium">{name}</span>
        {badge}
      </div>
      {status && !status.ok ? (
        <p className="text-xs text-destructive">{serviceErrorMessage(service, status.error)}</p>
      ) : null}
    </div>
  );
}

function MetadataPage() {
  const { data } = useSuspenseQuery(serviceSettingsQuery());
  const testFn = useServerFn(testMetadataProviders);
  const test = useMutation({ mutationFn: () => testFn() });

  return (
    <div className="flex flex-col gap-12">
      <SettingsSection
        title={m.metadata_providers_title()}
        description={m.metadata_providers_description()}
        actions={
          <Button variant="outline" isDisabled={test.isPending} onPress={() => test.mutate()}>
            {test.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <FlaskConicalIcon data-icon="inline-start" />
            )}
            {m.action_test()}
          </Button>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>{m.metadata_status_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ProviderStatus
              name={m.service_audible()}
              service="audible"
              status={test.data?.audible}
              configured
            />
            <ProviderStatus
              name={m.service_hardcover()}
              service="hardcover"
              status={test.data?.hardcover}
              configured={data.hardcover.hasToken}
            />
          </CardContent>
        </Card>
      </SettingsSection>
      <SettingsSection
        title={m.metadata_selection_title()}
        description={m.settings_metadata_section_description()}
      >
        <AudibleRegionForm current={data.metadata} />
        <HardcoverForm hasToken={data.hardcover.hasToken} />
      </SettingsSection>
    </div>
  );
}
