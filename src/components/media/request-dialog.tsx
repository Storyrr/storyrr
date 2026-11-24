import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { InfoIcon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
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
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import {
  EMPTY_TARGET,
  targetOverride,
  TargetOptions,
  type TargetChoice,
} from "#/components/media/target-options";
import { requestMedia } from "#/functions/requests.functions";
import { formatList } from "#/lib/format";
import { mediaKeys } from "#/lib/queries/media";
import { requestKeys } from "#/lib/queries/requests";
import type { SearchableType } from "#/lib/media-types";
import { m } from "#/paraglide/messages.js";

type Item = { type: SearchableType; externalId: string; title: string; authors: string[] };

/** "Request" button and its confirmation dialog (Seerr-like), for one audiobook or eBook. */
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
  const requestFn = useServerFn(requestMedia);
  const request = useMutation({
    mutationFn: (choice: TargetChoice) =>
      requestFn({
        data: { media: { type: item.type, id: item.externalId }, ...targetOverride(choice) },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
        queryClient.invalidateQueries({ queryKey: requestKeys.all }),
      ]);
      onDone();
    },
  });

  const form = useForm({
    defaultValues: { target: EMPTY_TARGET },
    onSubmit: async ({ value }) => {
      await request.mutateAsync(value.target).catch(() => undefined);
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
        {(item.type === "podcast" ? user.autoApprovedPodcasts : user.autoApproved) ? (
          <Alert>
            <InfoIcon />
            <AlertDescription>{m.request_auto_approved_info()}</AlertDescription>
          </Alert>
        ) : null}
        {user.isAdmin ? (
          <form.Field name="target">
            {(field) => (
              <TargetOptions
                format={item.type}
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
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
