import { useForm } from "@tanstack/react-form";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { Cover } from "#/components/media/cover";
import { AdvancedOptions } from "#/components/media/request-dialog";
import { Button } from "#/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Field, FieldError, FieldGroup } from "#/components/ui/field";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import {
  approveRequest,
  cancelRequest,
  denyRequest,
  retryRequest,
  type getRequests,
} from "#/functions/requests.functions";
import { formatDate, formatList } from "#/lib/format";
import { describeRequestError } from "#/lib/request-errors";
import { DenyReasonSchema } from "#/lib/schemas/requests";
import { m } from "#/paraglide/messages.js";

import { RequestHistory } from "./request-history";
import { RequestStatusBadge } from "./request-status-badge";
import { useRequestAction } from "./use-request-action";

type RequestListItem = Awaited<ReturnType<typeof getRequests>>[number];

export function RequestRow({ request }: { request: RequestListItem }) {
  const { user } = useRouteContext({ from: "/_authed" });
  const cancelFn = useServerFn(cancelRequest);
  const retryFn = useServerFn(retryRequest);
  const cancel = useRequestAction((vars: { id: string }) => cancelFn({ data: vars }), "cancelled");
  const retry = useRequestAction((vars: { id: string }) => retryFn({ data: vars }), "approved");
  const error = cancel.error ?? retry.error;
  const failure = request.status === "failed" ? describeRequestError(request.lastError) : null;
  const canCancel =
    request.status === "pending" && (user.isAdmin || request.requester.id === user.id);

  return (
    <li className="flex flex-col gap-3 border-b py-4 last:border-b-0">
      <div className="flex gap-4">
        <Cover src={request.media.coverUrl} className="size-16 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/media/$type/$id"
              params={{ type: request.media.type, id: request.media.externalId }}
              className="truncate font-medium hover:underline"
            >
              {request.media.title}
            </Link>
            <RequestStatusBadge status={request.status} />
          </div>
          {request.media.authors.length > 0 ? (
            <p className="truncate text-sm text-muted-foreground">
              {formatList(request.media.authors)}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {m.requests_requested_on({
              name: request.requester.name,
              date: formatDate(new Date(request.createdAt)),
            })}
            {request.watchers > 0 ? ` · ${m.requests_watchers({ count: request.watchers })}` : null}
            {user.isAdmin && request.target.service === "chaptarr"
              ? ` · ${request.target.rootFolderPath}`
              : null}
          </p>
          {failure ? <p className="text-sm text-destructive">{failure}</p> : null}
        </div>
      </div>
      <FormError message={error ? error.message || m.error_generic() : null} />
      <div className="flex flex-wrap items-center gap-2">
        {user.isAdmin && request.status === "pending" ? (
          <>
            <ApproveDialog request={request} />
            <DenyDialog request={request} />
          </>
        ) : null}
        {user.isAdmin && request.status === "failed" ? (
          <>
            <Button
              size="sm"
              isDisabled={retry.isPending}
              onPress={() => retry.mutate({ id: request.id })}
            >
              {m.action_retry()}
            </Button>
            <Button
              size="sm"
              variant="outline"
              isDisabled={cancel.isPending}
              onPress={() => cancel.mutate({ id: request.id })}
            >
              {m.action_cancel()}
            </Button>
          </>
        ) : null}
        {canCancel ? (
          <Button
            size="sm"
            variant="outline"
            isDisabled={cancel.isPending}
            onPress={() => cancel.mutate({ id: request.id })}
          >
            {m.action_cancel()}
          </Button>
        ) : null}
        <HistoryDisclosure requestId={request.id} />
      </div>
    </li>
  );
}

function HistoryDisclosure({ requestId }: { requestId: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Collapsible isExpanded={expanded} onExpandedChange={setExpanded} className="w-full">
      <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronDownIcon className={expanded ? "rotate-180" : undefined} />
        {m.requests_history()}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        {expanded ? <RequestHistory requestId={requestId} /> : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ApproveDialog({ request }: { request: RequestListItem }) {
  const [open, setOpen] = useState(false);
  const approveFn = useServerFn(approveRequest);
  const approve = useRequestAction(
    (vars: { id: string; rootFolderPath?: string; qualityProfileId?: number }) =>
      approveFn({ data: vars }),
    "approved",
  );
  const form = useForm({
    defaultValues: { rootFolderPath: "", qualityProfileId: "" },
    onSubmit: async ({ value }) => {
      await approve
        .mutateAsync({
          id: request.id,
          rootFolderPath: value.rootFolderPath || undefined,
          qualityProfileId: value.qualityProfileId ? Number(value.qualityProfileId) : undefined,
        })
        .then(() => setOpen(false))
        .catch(() => undefined);
    },
  });

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button size="sm">{m.action_approve()}</Button>
      <Dialog showCloseButton={false} className="sm:max-w-md">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{request.media.title}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <FormError
              message={approve.error ? approve.error.message || m.error_generic() : null}
            />
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
          </FieldGroup>
          <DialogFooter>
            <DialogClose>{m.action_cancel()}</DialogClose>
            <Button type="submit" isDisabled={approve.isPending}>
              {m.action_approve()}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </DialogTrigger>
  );
}

function DenyDialog({ request }: { request: RequestListItem }) {
  const [open, setOpen] = useState(false);
  const denyFn = useServerFn(denyRequest);
  const deny = useRequestAction(
    (vars: { id: string; reason?: string }) => denyFn({ data: vars }),
    "denied",
  );
  const form = useForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: DenyReasonSchema },
    onSubmit: async ({ value }) => {
      await deny
        .mutateAsync({ id: request.id, reason: value.reason.trim() || undefined })
        .then(() => setOpen(false))
        .catch(() => undefined);
    },
  });
  const reasonId = `deny-${request.id}`;

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline">
        {m.action_deny()}
      </Button>
      <Dialog showCloseButton={false} className="sm:max-w-md">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{m.requests_deny_title({ title: request.media.title })}</DialogTitle>
          </DialogHeader>
          <FormError message={deny.error ? deny.error.message || m.error_generic() : null} />
          <form.Field name="reason">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
                <Label htmlFor={reasonId}>{m.requests_deny_reason()}</Label>
                <Textarea
                  id={reasonId}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                <FieldError errors={field.state.meta.errors} />
              </Field>
            )}
          </form.Field>
          <DialogFooter>
            <DialogClose>{m.action_cancel()}</DialogClose>
            <Button type="submit" variant="destructive" isDisabled={deny.isPending}>
              {m.action_deny()}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </DialogTrigger>
  );
}
