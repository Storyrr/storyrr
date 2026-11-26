import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckIcon, CopyIcon, PauseIcon, PlayIcon, SearchIcon } from "lucide-react";
import { useId, useState } from "react";

import { SelectField } from "#/components/form/select-field";
import { SettingsSection } from "#/components/settings/settings-section";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "#/components/ui/input-group";
import { Label } from "#/components/ui/label";
import { Spinner } from "#/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { getJobs, getLogs, runJobNow } from "#/functions/settings.functions";
import { copyText } from "#/lib/clipboard";
import { formatDate } from "#/lib/format";
import { m } from "#/paraglide/messages.js";

type JobName = "library-sync" | "submit-approved";
type Level = "debug" | "info" | "warn" | "error";
const LEVELS: readonly Level[] = ["debug", "info", "warn", "error"];

const jobsQuery = {
  queryKey: ["settings", "jobs"] as const,
  queryFn: () => getJobs(),
  // Shows a run's result shortly after "Run now".
  refetchInterval: 5000,
};

export const Route = createFileRoute("/_authed/settings/jobs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(jobsQuery),
  head: () => ({ meta: [{ title: `${m.settings_tab_jobs()} · ${m.app_name()}` }] }),
  component: JobsPage,
});

const jobLabels: Record<JobName, { label: () => string; description: () => string }> = {
  "library-sync": { label: m.job_library_sync, description: m.job_library_sync_description },
  "submit-approved": {
    label: m.job_submit_approved,
    description: m.job_submit_approved_description,
  },
};
const levelLabels: Record<Level, () => string> = {
  debug: m.log_level_debug,
  info: m.log_level_info,
  warn: m.log_level_warn,
  error: m.log_level_error,
};
const when = (value: Date | string | null | undefined) =>
  value ? formatDate(new Date(value), { dateStyle: "short", timeStyle: "medium" }) : "—";

function JobsPage() {
  return (
    <div className="flex flex-col gap-12">
      <Jobs />
      <Logs />
    </div>
  );
}

function Jobs() {
  const { data: jobs } = useSuspenseQuery(jobsQuery);
  const queryClient = useQueryClient();
  const runFn = useServerFn(runJobNow);
  const run = useMutation({
    mutationFn: (name: JobName) => runFn({ data: { name } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: jobsQuery.queryKey }),
  });
  return (
    <SettingsSection title={m.jobs_title()} description={m.jobs_description()}>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table aria-label={m.jobs_title()}>
          <TableHeader className="bg-muted/50">
            <TableHead isRowHeader className="px-4">
              {m.jobs_column_job()}
            </TableHead>
            <TableHead>{m.jobs_column_last_run()}</TableHead>
            <TableHead>{m.jobs_column_next_run()}</TableHead>
            <TableHead className="px-4 text-right">
              <span className="sr-only">{m.users_column_actions()}</span>
            </TableHead>
          </TableHeader>
          <TableBody items={jobs.map((job) => ({ ...job, id: job.name }))}>
            {(job) => (
              <TableRow id={job.name}>
                <TableCell className="px-4 py-3 whitespace-normal">
                  <div className="flex flex-col">
                    <span className="font-medium">{jobLabels[job.name].label()}</span>
                    <span className="text-xs text-muted-foreground">
                      {jobLabels[job.name].description()}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span>{when(job.lastRun?.startedAt)}</span>
                    {job.running ? (
                      <Badge variant="secondary">{m.jobs_running()}</Badge>
                    ) : job.lastRun?.error ? (
                      <Badge variant="destructive" title={job.lastRun.error}>
                        {m.jobs_failed()}
                      </Badge>
                    ) : job.lastRun ? (
                      <Badge>{m.jobs_succeeded()}</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{when(job.nextRun)}</TableCell>
                <TableCell className="px-4">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      isDisabled={job.running || (run.isPending && run.variables === job.name)}
                      onPress={() => run.mutate(job.name)}
                    >
                      {job.running ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <PlayIcon data-icon="inline-start" />
                      )}
                      {m.jobs_run_now()}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </SettingsSection>
  );
}

function Logs() {
  const searchId = useId();
  const [minLevel, setMinLevel] = useState<Level>("info");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const getFn = useServerFn(getLogs);
  const logs = useQuery({
    queryKey: ["settings", "logs", minLevel, search] as const,
    queryFn: () => getFn({ data: { minLevel, search } }),
    refetchInterval: paused ? false : 5000,
  });
  const copy = () => {
    const text = (logs.data ?? [])
      .map((e) => `${new Date(e.time).toISOString()} ${e.level.toUpperCase()} ${e.message}`)
      .join("\n");
    void copyText(text).then(setCopied);
  };

  return (
    <SettingsSection
      title={m.logs_title()}
      description={m.logs_description()}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onPress={() => setPaused(!paused)}>
            {paused ? (
              <PlayIcon data-icon="inline-start" />
            ) : (
              <PauseIcon data-icon="inline-start" />
            )}
            {paused ? m.logs_resume() : m.logs_pause()}
          </Button>
          <Button variant="outline" size="sm" onPress={copy}>
            {copied ? (
              <CheckIcon data-icon="inline-start" />
            ) : (
              <CopyIcon data-icon="inline-start" />
            )}
            {m.action_copy()}
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-44">
          <SelectField
            label={m.logs_level()}
            options={LEVELS.map((level) => ({ id: level, label: levelLabels[level]() }))}
            value={minLevel}
            onChange={(value) => {
              const level = LEVELS.find((l) => l === value);
              if (level) setMinLevel(level);
            }}
          />
        </div>
        <div className="flex min-w-60 flex-1 flex-col gap-2">
          <Label htmlFor={searchId}>{m.logs_search()}</Label>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id={searchId}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
        </div>
      </div>
      <div className="max-h-[32rem] overflow-y-auto rounded-xl border bg-card font-mono text-xs">
        {logs.isPending ? <Spinner className="m-4" /> : null}
        {logs.data?.length === 0 ? (
          <p className="p-4 font-sans text-sm text-muted-foreground">{m.logs_empty()}</p>
        ) : null}
        <ul className="divide-y">
          {logs.data?.map((entry) => (
            <li key={entry.id} className="flex gap-3 px-3 py-1.5">
              <time
                className="shrink-0 text-muted-foreground"
                dateTime={new Date(entry.time).toISOString()}
              >
                {when(new Date(entry.time))}
              </time>
              <Badge
                variant={
                  entry.level === "error"
                    ? "destructive"
                    : entry.level === "warn"
                      ? "default"
                      : "outline"
                }
                className="shrink-0 uppercase"
              >
                {entry.level}
              </Badge>
              <span className="break-all whitespace-pre-wrap">{entry.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </SettingsSection>
  );
}
