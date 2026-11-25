import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { DownloadIcon, InfoIcon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { Alert, AlertDescription } from "#/components/ui/alert";
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
import { FieldGroup, FieldLegend, FieldSet } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { requestMedia } from "#/functions/requests.functions";
import { formatList } from "#/lib/format";
import { hasPermission } from "#/lib/permissions";
import { mediaKeys } from "#/lib/queries/media";
import { quotaQuery, requestKeys } from "#/lib/queries/requests";
import { chaptarrOptionsQuery } from "#/lib/queries/settings";
import type { SearchableType } from "#/lib/media-types";
import { chaptarrOptionsErrorMessage } from "#/lib/service-errors";
import { can } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";

type Item = { type: SearchableType; externalId: string; title: string; authors: string[] };

/** "Request" button and its confirmation dialog (Seerr-like), for one audiobook or eBook. */
export function RequestDialog({
  item,
  size,
  className,
}: {
  item: Item;
  size?: "sm" | "default";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button size={size} className={className}>
        <DownloadIcon data-icon="inline-start" />
        {m.action_request()}
      </Button>
      <Dialog showCloseButton={false} className="sm:max-w-lg">
        {open ? <RequestForm item={item} onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </DialogTrigger>
  );
}

function RequestForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const { user } = useRouteContext({ from: "/_authed" });
  const queryClient = useQueryClient();
  const requestFn = useServerFn(requestMedia);
  const quota = useQuery(quotaQuery(item.type)).data;
  const exhausted = quota?.remaining === 0;
  const request = useMutation({
    mutationFn: (data: { rootFolderPath?: string; qualityProfileId?: number }) =>
      requestFn({ data: { media: { type: item.type, id: item.externalId }, ...data } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
        queryClient.invalidateQueries({ queryKey: requestKeys.all }),
      ]);
      onDone();
    },
  });

  const form = useForm({
    defaultValues: { rootFolderPath: "", qualityProfileId: "" },
    onSubmit: async ({ value }) => {
      await request
        .mutateAsync({
          rootFolderPath: value.rootFolderPath || undefined,
          qualityProfileId: value.qualityProfileId ? Number(value.qualityProfileId) : undefined,
        })
        .catch(() => undefined);
    },
  });

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
        <DialogTitle>{m.request_dialog_title({ title: item.title })}</DialogTitle>
        {item.authors.length > 0 ? (
          <DialogDescription>{formatList(item.authors)}</DialogDescription>
        ) : null}
      </DialogHeader>
      <FieldGroup>
        <FormError message={request.error ? request.error.message || m.error_generic() : null} />
        {quota && quota.limit !== null && quota.remaining !== null ? (
          exhausted ? (
            <FormError
              message={m.request_quota_exceeded({ limit: quota.limit, days: quota.days })}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {m.request_quota_left({
                remaining: quota.remaining,
                limit: quota.limit,
                days: quota.days,
              })}
            </p>
          )
        ) : null}
        {hasPermission(user.permissions, `auto_approve_${item.type}`) ? (
          <Alert>
            <InfoIcon />
            <AlertDescription>{m.request_auto_approved_info()}</AlertDescription>
          </Alert>
        ) : null}
        {can(user, "request_advanced") ? (
          <AdvancedOptions format={item.type}>
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
            <Button type="submit" isDisabled={isSubmitting || exhausted}>
              {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
              {m.action_request()}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

export type ChaptarrOptions = {
  rootFolders: { path: string; name: string }[];
  qualityProfiles: { id: number; name: string }[];
  defaults: { rootFolderPath: string | null; qualityProfileId: number | null };
};

const withDefault = (label: string, isDefault: boolean) =>
  isDefault ? m.request_default_option({ label }) : label;

/**
 * The root folder and quality profile pickers, showing what applies when left
 * alone (Seerr's "(default)"): an empty value means "keep it", and is sent as
 * nothing so the server applies its default.
 */
export function TargetSelects({
  options,
  rootFolderPath,
  onRootFolderPathChange,
  qualityProfileId,
  onQualityProfileIdChange,
  current,
}: {
  options: ChaptarrOptions;
  rootFolderPath: string;
  onRootFolderPathChange: (value: string) => void;
  qualityProfileId: string;
  onQualityProfileIdChange: (value: string) => void;
  /** What applies now if it isn't the default (a pending request's own target). */
  current?: { rootFolderPath?: string | null; qualityProfileId?: number | null };
}) {
  const fallbackFolder = current?.rootFolderPath ?? options.defaults.rootFolderPath;
  const fallbackProfile = current?.qualityProfileId ?? options.defaults.qualityProfileId;
  return (
    <>
      <SelectField
        label={m.field_root_folder()}
        options={options.rootFolders.map((f) => ({
          id: f.path,
          label: withDefault(`${f.name} (${f.path})`, f.path === options.defaults.rootFolderPath),
        }))}
        value={rootFolderPath || fallbackFolder || null}
        onChange={(value) => onRootFolderPathChange(value ?? "")}
      />
      <SelectField
        label={m.field_quality_profile()}
        options={options.qualityProfiles.map((p) => ({
          id: String(p.id),
          label: withDefault(p.name, p.id === options.defaults.qualityProfileId),
        }))}
        value={qualityProfileId || (fallbackProfile === null ? null : String(fallbackProfile))}
        onChange={(value) => onQualityProfileIdChange(value ?? "")}
      />
    </>
  );
}

/** Those allowed only: always shown, so the folder and profile a request gets are never a surprise. */
export function AdvancedOptions({
  format,
  children,
}: {
  /** Lists the root folders compatible with this format (e.g. Books, Manga, Comics for eBooks). */
  format: SearchableType;
  children: (options: ChaptarrOptions) => React.ReactNode;
}) {
  const options = useQuery(chaptarrOptionsQuery(format));
  return (
    <FieldSet>
      <FieldLegend>{m.request_advanced_options()}</FieldLegend>
      {options.isPending ? <Spinner /> : null}
      {options.data && !options.data.ok ? (
        <FormError message={chaptarrOptionsErrorMessage(options.data)} />
      ) : null}
      {options.data?.ok ? (
        <div className="grid gap-4 sm:grid-cols-2">{children(options.data)}</div>
      ) : null}
    </FieldSet>
  );
}
