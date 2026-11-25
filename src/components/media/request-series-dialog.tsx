import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { DownloadIcon, InfoIcon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { AvailabilityBadge } from "#/components/media/availability-badge";
import { AdvancedOptions, TargetSelects } from "#/components/media/request-dialog";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { requestMany } from "#/functions/requests.functions";
import type { SearchableType } from "#/lib/media-types";
import { can, hasPermission } from "#/lib/permissions";
import { mediaKeys, seriesQuery } from "#/lib/queries/media";
import { quotaQuery, requestKeys } from "#/lib/queries/requests";
import type { AnnotatedTitle } from "#/lib/series";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

const isRequestable = (item: AnnotatedTitle) =>
  item.availability === "none" && item.accepted !== false;

/**
 * Seerr's season picker for books: request several volumes of a series at once.
 * Opened from the series page (volumes known) or from a series card in search
 * (volumes loaded when it opens).
 */
export function RequestSeriesDialog({
  type,
  seriesId,
  name,
  items,
  size,
  className,
}: {
  type: SearchableType;
  seriesId: string;
  name: string;
  /** The volumes when already loaded (series page); else fetched on open. */
  items?: AnnotatedTitle[];
  size?: "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // On the series page, nothing left to request means no button.
  if (items && !items.some(isRequestable)) return null;
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button size={size} className={className}>
        <DownloadIcon data-icon="inline-start" />
        {items ? m.collection_request_series() : m.action_request()}
      </Button>
      <Dialog showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {open ? (
          items ? (
            <SeriesRequestForm
              type={type}
              name={name}
              items={items}
              onDone={() => setOpen(false)}
            />
          ) : (
            <LoadedSeriesRequestForm
              type={type}
              seriesId={seriesId}
              name={name}
              onDone={() => setOpen(false)}
            />
          )
        ) : null}
      </Dialog>
    </DialogTrigger>
  );
}

function LoadedSeriesRequestForm({
  type,
  seriesId,
  name,
  onDone,
}: {
  type: SearchableType;
  seriesId: string;
  name: string;
  onDone: () => void;
}) {
  const series = useQuery(seriesQuery(type, seriesId));
  if (series.isPending) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{m.collection_request_series()}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <Spinner className="mx-auto my-6" />
      </>
    );
  }
  const error = series.isError
    ? series.error.message || m.error_generic()
    : !series.data.ok
      ? serviceErrorMessage(type === "ebook" ? "hardcover" : "audible", series.data.error)
      : null;
  if (error || !series.data?.ok) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{m.collection_request_series()}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <FormError message={error ?? m.error_generic()} />
        <DialogFooter>
          <DialogClose>{m.action_cancel()}</DialogClose>
        </DialogFooter>
      </>
    );
  }
  return (
    <SeriesRequestForm
      type={type}
      name={series.data.name}
      items={series.data.results}
      onDone={onDone}
    />
  );
}

function VolumeStatus({ item }: { item: AnnotatedTitle }) {
  if (item.availability !== "none") return <AvailabilityBadge availability={item.availability} />;
  if (item.accepted === false)
    return <Badge variant="outline">{m.media_language_refused_short()}</Badge>;
  return <Badge variant="secondary">{m.series_not_requested()}</Badge>;
}

function SeriesRequestForm({
  type,
  name,
  items,
  onDone,
}: {
  type: SearchableType;
  name: string;
  items: AnnotatedTitle[];
  onDone: () => void;
}) {
  const { user } = useRouteContext({ from: "/_authed" });
  const requestable = items.filter(isRequestable);
  // Nothing picked at first, like Seerr: the header switch picks them all.
  const [selected, setSelected] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const quota = useQuery(quotaQuery(type)).data;
  const remaining = quota?.remaining ?? null;
  const overQuota = remaining !== null && selected.length > remaining;
  const requestFn = useServerFn(requestMany);
  const request = useMutation({
    mutationFn: (data: { ids: string[]; rootFolderPath?: string; qualityProfileId?: number }) =>
      requestFn({ data: { type, ...data } }),
    onSuccess: async (results) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
        queryClient.invalidateQueries({ queryKey: requestKeys.all }),
      ]);
      if (results.every((r) => r.ok)) onDone();
    },
  });
  const failures = request.data?.filter((r) => !r.ok) ?? [];
  const form = useForm({
    defaultValues: { rootFolderPath: "", qualityProfileId: "" },
    onSubmit: async ({ value }) => {
      await request
        .mutateAsync({
          ids: selected,
          rootFolderPath: value.rootFolderPath || undefined,
          qualityProfileId: value.qualityProfileId ? Number(value.qualityProfileId) : undefined,
        })
        .catch(() => undefined);
    },
  });
  const allSelected = requestable.length > 0 && selected.length === requestable.length;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{m.collection_request_series()}</DialogTitle>
        <DialogDescription>{name}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <FormError message={request.error ? request.error.message || m.error_generic() : null} />
        {failures.length > 0 ? (
          <FormError
            message={failures
              .map(
                (f) =>
                  `${items.find((i) => i.externalId === f.id)?.title ?? f.id}: ${f.error ?? ""}`,
              )
              .join("\n")}
          />
        ) : null}
        {hasPermission(user.permissions, `auto_approve_${type}`) ? (
          <Alert>
            <InfoIcon />
            <AlertDescription>{m.request_auto_approved_info()}</AlertDescription>
          </Alert>
        ) : null}
        {quota && quota.limit !== null && remaining !== null ? (
          overQuota || remaining === 0 ? (
            <FormError
              message={m.request_quota_exceeded({ limit: quota.limit, days: quota.days })}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {m.request_quota_left({ remaining, limit: quota.limit, days: quota.days })}
            </p>
          )
        ) : null}
        <div className="overflow-hidden rounded-lg border">
          <Table aria-label={m.series_volumes()}>
            <TableHeader className="bg-muted/50">
              <TableHead className="w-12 px-4">
                <Switch
                  aria-label={m.collection_select_all()}
                  isSelected={allSelected}
                  isDisabled={requestable.length === 0}
                  onChange={(on) => setSelected(on ? requestable.map((i) => i.externalId) : [])}
                />
              </TableHead>
              <TableHead className="w-20">{m.series_column_volume()}</TableHead>
              <TableHead isRowHeader>{m.series_column_title()}</TableHead>
              <TableHead className="px-4 text-right">{m.series_column_status()}</TableHead>
            </TableHeader>
            <TableBody items={items.map((item) => ({ ...item, id: item.externalId }))}>
              {(item) => (
                <TableRow id={item.externalId}>
                  <TableCell className="px-4 py-3">
                    <Switch
                      aria-label={item.title}
                      isSelected={selected.includes(item.externalId)}
                      isDisabled={!isRequestable(item)}
                      onChange={(on) =>
                        setSelected((current) =>
                          on
                            ? [...current, item.externalId]
                            : current.filter((id) => id !== item.externalId),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.series[0]?.position ?? ""}
                  </TableCell>
                  <TableCell className="max-w-0 truncate">{item.title}</TableCell>
                  <TableCell className="px-4 text-right">
                    <VolumeStatus item={item} />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {can(user, "request_advanced") ? (
          <AdvancedOptions format={type}>
            {(options) => (
              <>
                <form.Subscribe selector={(state) => state.values}>
                  {(values) => (
                    <TargetSelects
                      options={options}
                      rootFolderPath={values.rootFolderPath}
                      onRootFolderPathChange={(value) =>
                        form.setFieldValue("rootFolderPath", value)
                      }
                      qualityProfileId={values.qualityProfileId}
                      onQualityProfileIdChange={(value) =>
                        form.setFieldValue("qualityProfileId", value)
                      }
                    />
                  )}
                </form.Subscribe>
              </>
            )}
          </AdvancedOptions>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <DialogClose>{m.action_cancel()}</DialogClose>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              isDisabled={isSubmitting || selected.length === 0 || overQuota || remaining === 0}
            >
              {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
              {selected.length === 0
                ? m.series_select_volumes()
                : m.collection_request_count({ count: selected.length })}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}
