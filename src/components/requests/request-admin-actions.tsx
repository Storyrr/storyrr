import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2Icon } from "lucide-react";
import { useId, useState } from "react";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Field, FieldLabel } from "#/components/ui/field";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Spinner } from "#/components/ui/spinner";
import { deleteRequest, removeFromChaptarr } from "#/functions/requests.functions";
import { mediaKeys } from "#/lib/queries/media";
import { requestKeys } from "#/lib/queries/requests";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

function useInvalidateRequests() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: requestKeys.all }),
      queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
    ]);
}

/** Seerr-like "Delete request": removes it from Storyrr only. */
export function DeleteRequestButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const deleteFn = useServerFn(deleteRequest);
  const invalidate = useInvalidateRequests();
  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: async () => {
      setOpen(false);
      await invalidate();
    },
  });

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button size="sm" variant="destructive">
        <Trash2Icon data-icon="inline-start" />
        {m.action_delete_request()}
      </Button>
      <Dialog showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.requests_delete_title({ title })}</DialogTitle>
          <DialogDescription>{m.requests_delete_description()}</DialogDescription>
        </DialogHeader>
        <FormError message={remove.error ? remove.error.message || m.error_generic() : null} />
        <DialogFooter>
          <DialogClose>{m.action_cancel()}</DialogClose>
          <Button
            variant="destructive"
            isDisabled={remove.isPending}
            onPress={() => remove.mutate()}
          >
            {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.action_delete_request()}
          </Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  );
}

/** Seerr-like "Remove from Radarr", for Chaptarr: files are kept unless asked. */
export function RemoveFromChaptarrButton({ id, title }: { id: string; title: string }) {
  const deleteFilesId = useId();
  const [open, setOpen] = useState(false);
  const removeFn = useServerFn(removeFromChaptarr);
  const invalidate = useInvalidateRequests();
  const [outcome, setOutcome] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (deleteFiles: boolean) => removeFn({ data: { id, deleteFiles } }),
    onMutate: () => setOutcome(null),
    onSuccess: async (result) => {
      await invalidate();
      if (!result.ok) {
        setOutcome(
          result.error.kind === "not_found"
            ? m.requests_remove_nothing()
            : serviceErrorMessage("chaptarr", result.error),
        );
        return;
      }
      if (result.sharedPending > 0) setOutcome(m.requests_removed_shared());
      else setOpen(false);
    },
  });
  const form = useForm({
    defaultValues: { deleteFiles: false },
    onSubmit: async ({ value }) => {
      await remove.mutateAsync(value.deleteFiles).catch(() => undefined);
    },
  });

  return (
    <DialogTrigger
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setOutcome(null);
      }}
    >
      <Button size="sm" variant="destructive">
        <Trash2Icon data-icon="inline-start" />
        {m.action_remove_from_chaptarr()}
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
            <DialogTitle>{m.requests_remove_title({ title })}</DialogTitle>
            <DialogDescription>{m.requests_remove_description()}</DialogDescription>
          </DialogHeader>
          <FormError message={remove.error ? remove.error.message || m.error_generic() : null} />
          {outcome && remove.data?.ok ? <FormSuccess message={outcome} /> : null}
          {outcome && !remove.data?.ok ? <FormError message={outcome} /> : null}
          <form.Field name="deleteFiles">
            {(field) => (
              <Field orientation="horizontal">
                <Checkbox
                  id={deleteFilesId}
                  isSelected={field.state.value}
                  onChange={field.handleChange}
                />
                <FieldLabel htmlFor={deleteFilesId} className="font-normal">
                  {m.requests_remove_delete_files()}
                </FieldLabel>
              </Field>
            )}
          </form.Field>
          <DialogFooter>
            <DialogClose>{outcome ? m.action_close() : m.action_cancel()}</DialogClose>
            {outcome ? null : (
              <Button type="submit" variant="destructive" isDisabled={remove.isPending}>
                {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
                {m.action_remove_from_chaptarr()}
              </Button>
            )}
          </DialogFooter>
        </form>
      </Dialog>
    </DialogTrigger>
  );
}
