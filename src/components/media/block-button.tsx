import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";

import { FormError } from "#/components/form/form-error";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Field, FieldError } from "#/components/ui/field";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { blockMedia, unblockMedia } from "#/functions/requests.functions";
import type { SearchableType } from "#/lib/media-types";
import { mediaKeys } from "#/lib/queries/media";
import { BlockReasonSchema } from "#/lib/schemas/requests";
import { m } from "#/paraglide/messages.js";

function useInvalidateMedia() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: mediaKeys.all });
}

/** Admins: block a title (with an optional reason) or unblock it. */
export function BlockButton({
  type,
  externalId,
  title,
  blockId,
}: {
  type: SearchableType;
  externalId: string;
  title: string;
  /** Set when the title is blocked. */
  blockId: string | null;
}) {
  const unblockFn = useServerFn(unblockMedia);
  const invalidate = useInvalidateMedia();
  const unblock = useMutation({
    mutationFn: (id: string) => unblockFn({ data: { id } }),
    onSuccess: invalidate,
  });
  if (blockId) {
    return (
      <>
        <Button
          variant="outline"
          size="icon"
          aria-label={m.action_unblock()}
          isDisabled={unblock.isPending}
          onPress={() => unblock.mutate(blockId)}
        >
          <EyeIcon />
        </Button>
        <FormError message={unblock.error ? unblock.error.message || m.error_generic() : null} />
      </>
    );
  }
  return <BlockDialog type={type} externalId={externalId} title={title} />;
}

function BlockDialog({
  type,
  externalId,
  title,
}: {
  type: SearchableType;
  externalId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const blockFn = useServerFn(blockMedia);
  const invalidate = useInvalidateMedia();
  const reasonId = useId();
  const block = useMutation({
    mutationFn: (reason: string) =>
      blockFn({ data: { media: { type, id: externalId }, reason: reason.trim() || undefined } }),
    onSuccess: async () => {
      setOpen(false);
      await invalidate();
    },
  });
  const form = useForm({
    defaultValues: { reason: "" },
    validators: { onSubmit: BlockReasonSchema },
    onSubmit: async ({ value }) => {
      await block.mutateAsync(value.reason).catch(() => undefined);
    },
  });

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="outline" size="icon" aria-label={m.action_block()}>
        <EyeOffIcon />
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
            <DialogTitle>{m.blocklist_block_title({ title })}</DialogTitle>
          </DialogHeader>
          <FormError message={block.error ? block.error.message || m.error_generic() : null} />
          <form.Field name="reason">
            {(field) => (
              <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
                <Label htmlFor={reasonId}>{m.blocklist_reason()}</Label>
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
            <Button type="submit" variant="destructive" isDisabled={block.isPending}>
              {m.action_block()}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </DialogTrigger>
  );
}
