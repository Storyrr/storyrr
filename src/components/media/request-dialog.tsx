import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDownIcon, InfoIcon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
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
import { requestAudiobook } from "#/functions/requests.functions";
import { formatList } from "#/lib/format";
import { mediaKeys } from "#/lib/queries/media";
import { requestKeys } from "#/lib/queries/requests";
import { chaptarrAudiobookOptionsQuery } from "#/lib/queries/settings";
import { m } from "#/paraglide/messages.js";

type Item = { externalId: string; title: string; authors: string[] };

/** "Request" button and its confirmation dialog (Seerr-like), for one audiobook. */
export function RequestDialog({ item, size }: { item: Item; size?: "sm" | "default" }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button size={size}>{m.action_request()}</Button>
      <Dialog showCloseButton={false} className="sm:max-w-md">
        {open ? <RequestForm item={item} onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </DialogTrigger>
  );
}

function RequestForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const { user } = useRouteContext({ from: "/_authed" });
  const queryClient = useQueryClient();
  const requestFn = useServerFn(requestAudiobook);
  const request = useMutation({
    mutationFn: (data: { rootFolderPath?: string; qualityProfileId?: number }) =>
      requestFn({ data: { asin: item.externalId, ...data } }),
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
        {user.autoApproved ? (
          <Alert>
            <InfoIcon />
            <AlertDescription>{m.request_auto_approved_info()}</AlertDescription>
          </Alert>
        ) : null}
        {user.isAdmin ? (
          <AdvancedOptions>
            {(options) => (
              <>
                <form.Field name="rootFolderPath">
                  {(field) => (
                    <SelectField
                      label={m.field_root_folder()}
                      description={m.request_default_hint()}
                      options={options.rootFolders.map((f) => ({
                        id: f.path,
                        label: `${f.name} (${f.path})`,
                      }))}
                      value={field.state.value || null}
                      onChange={(value) => field.handleChange(value ?? "")}
                    />
                  )}
                </form.Field>
                <form.Field name="qualityProfileId">
                  {(field) => (
                    <SelectField
                      label={m.field_quality_profile()}
                      description={m.request_default_hint()}
                      options={options.qualityProfiles.map((p) => ({
                        id: String(p.id),
                        label: p.name,
                      }))}
                      value={field.state.value || null}
                      onChange={(value) => field.handleChange(value ?? "")}
                    />
                  )}
                </form.Field>
              </>
            )}
          </AdvancedOptions>
        ) : null}
      </FieldGroup>
      <DialogFooter>
        <DialogClose>{m.action_cancel()}</DialogClose>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" isDisabled={isSubmitting}>
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
};

/** Admins only: collapsed by default; empty fields mean "use the defaults". */
export function AdvancedOptions({
  children,
}: {
  children: (options: ChaptarrOptions) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const options = useQuery({ ...chaptarrAudiobookOptionsQuery(), enabled: expanded });

  return (
    <Collapsible isExpanded={expanded} onExpandedChange={setExpanded}>
      <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium">
        <ChevronDownIcon className={expanded ? "rotate-180" : undefined} />
        {m.request_advanced_options()}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <FieldGroup className="pt-4">
          {expanded && options.isPending ? <Spinner /> : null}
          {options.data && !options.data.ok ? (
            <FormError message={m.request_options_unavailable()} />
          ) : null}
          {options.data?.ok ? children(options.data) : null}
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  );
}
