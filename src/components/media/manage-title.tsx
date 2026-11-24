import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircleIcon, Settings2Icon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { issueTypeLabels, IssueStatusBadge } from "#/components/issues/issue-labels";
import { RequestStatusBadge } from "#/components/requests/request-status-badge";
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
import { Separator } from "#/components/ui/separator";
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { clearTitle, markTitleAvailable } from "#/functions/media.functions";
import { formatDate } from "#/lib/format";
import type { SearchableType } from "#/lib/media-types";
import { issueKeys } from "#/lib/queries/issues";
import { mediaKeys, titleAdminQuery } from "#/lib/queries/media";
import { requestKeys } from "#/lib/queries/requests";
import { m } from "#/paraglide/messages.js";

function useInvalidateTitle() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
      queryClient.invalidateQueries({ queryKey: requestKeys.all }),
      queryClient.invalidateQueries({ queryKey: issueKeys.all }),
    ]);
}

/** Seerr's "Manage" panel on a title: its requests and issues, mark available, clear data. */
export function ManageTitle({
  type,
  externalId,
  title,
  available,
}: {
  type: SearchableType;
  externalId: string;
  title: string;
  available: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SheetTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm">
        <Settings2Icon data-icon="inline-start" />
        {m.manage_title()}
      </Button>
      <SheetContent className="sm:max-w-md">
        {open ? (
          <ManagePanel type={type} externalId={externalId} title={title} available={available} />
        ) : null}
      </SheetContent>
    </SheetTrigger>
  );
}

function ManagePanel({
  type,
  externalId,
  title,
  available,
}: {
  type: SearchableType;
  externalId: string;
  title: string;
  available: boolean;
}) {
  const info = useQuery(titleAdminQuery(type, externalId));
  const invalidate = useInvalidateTitle();
  const markFn = useServerFn(markTitleAvailable);
  const mark = useMutation({
    mutationFn: () => markFn({ data: { type, id: externalId } }),
    onSuccess: invalidate,
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader>
        <SheetTitle>{m.manage_title_heading({ title })}</SheetTitle>
        <SheetDescription>{m.manage_title_description()}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-6 px-4 pb-6">
        {info.isPending ? <Skeleton className="h-32 w-full" /> : null}
        {info.isError ? <FormError message={info.error.message || m.error_generic()} /> : null}
        {info.data ? (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="font-medium">{m.manage_requests()}</h3>
              {info.data.requests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.manage_no_requests()}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {info.data.requests.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {m.requests_requested_on({
                          name: r.requester.name,
                          date: formatDate(new Date(r.createdAt)),
                        })}
                      </span>
                      <RequestStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-medium">{m.manage_issues()}</h3>
              {info.data.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.manage_no_issues()}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {info.data.issues.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link to="/issues/$id" params={{ id: i.id }} className="hover:underline">
                        {issueTypeLabels[i.type]()} · {formatDate(new Date(i.createdAt))}
                      </Link>
                      <IssueStatusBadge status={i.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Separator />
            <section className="flex flex-col gap-3">
              <h3 className="font-medium">{m.manage_actions()}</h3>
              <FormError message={mark.error ? mark.error.message || m.error_generic() : null} />
              {available || info.data.markedAvailable ? (
                <p className="text-sm text-muted-foreground">
                  {info.data.markedAvailable ? m.manage_marked_available() : m.manage_in_library()}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <Button isDisabled={mark.isPending} onPress={() => mark.mutate()}>
                    {mark.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <CheckCircleIcon data-icon="inline-start" />
                    )}
                    {m.manage_mark_available()}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {m.manage_mark_available_description()}
                  </p>
                </div>
              )}
              <ClearDataButton type={type} externalId={externalId} title={title} />
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ClearDataButton({
  type,
  externalId,
  title,
}: {
  type: SearchableType;
  externalId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const invalidate = useInvalidateTitle();
  const clearFn = useServerFn(clearTitle);
  const clear = useMutation({
    mutationFn: () => clearFn({ data: { type, id: externalId } }),
    onSuccess: async () => {
      setOpen(false);
      await invalidate();
    },
  });
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="destructive">
        <Trash2Icon data-icon="inline-start" />
        {m.manage_clear_data()}
      </Button>
      <Dialog showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.manage_clear_data_title({ title })}</DialogTitle>
          <DialogDescription>{m.manage_clear_data_description()}</DialogDescription>
        </DialogHeader>
        <FormError message={clear.error ? clear.error.message || m.error_generic() : null} />
        <DialogFooter>
          <DialogClose>{m.action_cancel()}</DialogClose>
          <Button variant="destructive" isDisabled={clear.isPending} onPress={() => clear.mutate()}>
            {clear.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.manage_clear_data()}
          </Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  );
}
