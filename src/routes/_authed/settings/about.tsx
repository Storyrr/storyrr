import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { SettingsRow, SettingsSection } from "#/components/settings/settings-section";
import { Badge } from "#/components/ui/badge";
import { formatDate } from "#/lib/format";
import { aboutQuery } from "#/lib/queries/about";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/settings/about")({
  loader: ({ context }) => context.queryClient.ensureQueryData(aboutQuery()),
  head: () => ({ meta: [{ title: `${m.settings_tab_about()} · ${m.app_name()}` }] }),
  component: AboutPage,
});

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="w-fit rounded-md bg-muted px-2 py-0.5 font-mono text-sm">{children}</code>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-fit items-center gap-1 text-sm text-primary hover:underline"
    >
      {children}
      <ExternalLinkIcon className="size-3.5" aria-hidden />
    </a>
  );
}

function AboutPage() {
  const { data: about } = useSuspenseQuery(aboutQuery());
  const latest = about.releases[0];
  return (
    <div className="flex flex-col gap-12">
      <SettingsSection title={m.about_title()}>
        <SettingsRow label={m.settings_version()}>
          <div className="flex flex-wrap items-center gap-2">
            <Code>{about.version}</Code>
            {about.updateAvailable === false ? <Badge>{m.about_up_to_date()}</Badge> : null}
            {about.updateAvailable && latest ? (
              <a href={latest.url} target="_blank" rel="noreferrer">
                <Badge variant="destructive">
                  {m.about_update_available({ version: latest.version })}
                </Badge>
              </a>
            ) : null}
          </div>
        </SettingsRow>
        <SettingsRow label={m.about_total_media()}>
          <p className="text-sm tabular-nums">{about.totals.media}</p>
        </SettingsRow>
        <SettingsRow label={m.about_total_requests()}>
          <p className="text-sm tabular-nums">{about.totals.requests}</p>
        </SettingsRow>
        <SettingsRow label={m.about_data_directory()}>
          <Code>{about.dataDirectory}</Code>
        </SettingsRow>
        <SettingsRow label={m.about_time_zone()}>
          <Code>{about.timeZone}</Code>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={m.about_help_title()}>
        <SettingsRow label={m.about_documentation()}>
          <ExternalLink href={`${about.repositoryUrl}#readme`}>
            {`${about.repositoryUrl}#readme`}
          </ExternalLink>
        </SettingsRow>
        <SettingsRow label={m.about_issues()}>
          <ExternalLink href={`${about.repositoryUrl}/issues`}>
            {`${about.repositoryUrl}/issues`}
          </ExternalLink>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={m.about_releases_title()}>
        {about.releases.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.about_releases_unavailable()}</p>
        ) : (
          about.releases.map((release) => (
            <SettingsRow
              key={release.version}
              label={release.version}
              description={
                release.publishedAt
                  ? formatDate(new Date(release.publishedAt), { dateStyle: "long" })
                  : undefined
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                {release.version === about.version ? (
                  <Badge variant="secondary">{m.about_current_version()}</Badge>
                ) : null}
                <ExternalLink href={release.url}>{m.about_release_notes()}</ExternalLink>
              </div>
            </SettingsRow>
          ))
        )}
      </SettingsSection>
    </div>
  );
}
