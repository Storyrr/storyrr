import { useForm } from "@tanstack/react-form";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { UserAvatar } from "#/components/layout/user-avatar";
import { Cover } from "#/components/media/cover";
import { AdvancedOptions, TargetSelects } from "#/components/media/request-dialog";
import { Button } from "#/components/ui/button";
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
  denyRequest,
  retryRequest,
  type getRequests,
} from "#/functions/requests.functions";
import { formatDate, formatDaysAgo, formatList, yearOf } from "#/lib/format";
import { isSearchableType } from "#/lib/media-types";
import { describeRequestError } from "#/lib/request-errors";
import type { RequestStatus } from "#/lib/requests";
import { DenyReasonSchema } from "#/lib/schemas/requests";
import { can } from "#/lib/permissions";
import { useImageUrl } from "#/lib/images";
import { m } from "#/paraglide/messages.js";

import { DeleteRequestButton, RemoveFromChaptarrButton } from "./request-admin-actions";
import { RequestHistory } from "./request-history";
import { RequestStatusBadge } from "./request-status-badge";
import { useRequestAction } from "./use-request-action";

type RequestListItem = Awaited<ReturnType<typeof getRequests>>[number];

/** Statuses after which Chaptarr may hold the book (or a pending request for it). */
const SENT_STATUSES: readonly RequestStatus[] = ["submitted", "available", "failed", "cancelled"];

/** One request as a Seerr-like line: cover and title, details, then the actions allowed. */
export function RequestRow({ request }: { request: RequestListItem }) {
  const imageUrl = useImageUrl();
  const { user } = useRouteContext({ from: "/_authed" });
  const retryFn = useServerFn(retryRequest);
  const retry = useRequestAction((vars: { id: string }) => retryFn({ data: vars }), "approved");
  const error = retry.error;
  const failure = request.status === "failed" ? describeRequestError(request.lastError) : null;
  const manager = can(user, "manage_requests");
  // Like Seerr: managers delete any request; requesters withdraw their own while pending.
  const canDelete = manager || (request.status === "pending" && request.requester?.id === user.id);

  const year = yearOf(request.media.releaseDate ?? undefined);
  const requesterName = request.requester?.name ?? m.users_deleted();
  const [historyOpen, setHistoryOpen] = useState(false);

  const requestedAt = new Date(request.createdAt);
  // Stacked full-width in the actions column, like Seerr's.
  const actions = "flex flex-col gap-2 [&_button]:w-full";

  return (
    <li className="relative overflow-hidden rounded-xl border bg-card">
      {request.media.coverUrl ? (
        <img
          src={imageUrl(request.media.coverUrl)}
          alt=""
          loading="lazy"
          className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-20 blur-sm"
        />
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/60"
      />
      {/* One request per line: the title, its details, then its actions. Stacked on phones. */}
      <div className="relative grid gap-4 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_13rem] lg:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <Cover
            src={request.media.coverUrl}
            type={request.media.type}
            className="w-12 shrink-0 shadow-lg"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            {year ? <span className="text-xs font-medium">{year}</span> : null}
            {isSearchableType(request.media.type) ? (
              <Link
                to="/media/$type/$id"
                params={{ type: request.media.type, id: request.media.externalId }}
                className="line-clamp-2 text-lg font-semibold hover:underline"
              >
                {request.media.title}
              </Link>
            ) : (
              <span className="line-clamp-2 text-lg font-semibold">{request.media.title}</span>
            )}
            {request.media.authors.length > 0 ? (
              <p className="truncate text-sm text-muted-foreground">
                {formatList(request.media.authors)}
              </p>
            ) : null}
            <Button
              size="xs"
              variant="ghost"
              className="-ml-2 w-fit text-muted-foreground"
              aria-expanded={historyOpen}
              onPress={() => setHistoryOpen(!historyOpen)}
            >
              <ChevronDownIcon
                data-icon="inline-start"
                className={historyOpen ? "rotate-180" : undefined}
              />
              {m.requests_history()}
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-sm">
          <dt className="font-medium text-muted-foreground">{m.request_card_status()}</dt>
          <dd>
            <RequestStatusBadge
              status={request.status}
              waitingForChaptarr={request.waitingForChaptarr}
              download={request.download}
            />
          </dd>
          <dt className="font-medium text-muted-foreground">{m.requests_requested()}</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            <span title={formatDate(requestedAt)}>{formatDaysAgo(requestedAt)}</span>
            <UserAvatar name={requesterName} className="size-5 text-[0.6rem]" />
            <span className="truncate font-medium">{requesterName}</span>
          </dd>
          {request.watchers > 0 ? (
            <>
              <dt className="font-medium text-muted-foreground">{m.requests_watchers_label()}</dt>
              <dd className="tabular-nums">{request.watchers}</dd>
            </>
          ) : null}
          {manager && request.target.service === "chaptarr" ? (
            <>
              <dt className="font-medium text-muted-foreground">{m.requests_folder()}</dt>
              <dd className="truncate">{request.target.rootFolderPath}</dd>
            </>
          ) : null}
        </dl>

        <div className={actions}>
          {manager && request.status === "pending" ? (
            <>
              <ApproveDialog request={request} />
              <DenyDialog request={request} />
            </>
          ) : null}
          {manager && request.status === "failed" ? (
            <Button
              size="sm"
              isDisabled={retry.isPending}
              onPress={() => retry.mutate({ id: request.id })}
            >
              {m.action_retry()}
            </Button>
          ) : null}
          {canDelete ? <DeleteRequestButton id={request.id} title={request.media.title} /> : null}
          {manager && SENT_STATUSES.includes(request.status) ? (
            <RemoveFromChaptarrButton id={request.id} title={request.media.title} />
          ) : null}
        </div>
      </div>
      {failure || error || historyOpen ? (
        // Full width under the line: what went wrong, and the history when opened.
        <div className="relative flex flex-col gap-3 border-t px-4 py-3">
          {failure ? <p className="text-sm text-destructive">{failure}</p> : null}
          {error ? <FormError message={error.message || m.error_generic()} /> : null}
          {historyOpen ? <RequestHistory requestId={request.id} /> : null}
        </div>
      ) : null}
    </li>
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
      <Dialog showCloseButton={false} className="sm:max-w-lg">
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
            <AdvancedOptions format={request.format === "ebook" ? "ebook" : "audiobook"}>
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
                        current={{
                          rootFolderPath:
                            request.target.service === "chaptarr"
                              ? request.target.rootFolderPath
                              : null,
                          qualityProfileId: request.qualityProfileId,
                        }}
                      />
                    )}
                  </form.Subscribe>
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
