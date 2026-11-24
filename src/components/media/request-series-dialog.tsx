import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DownloadIcon } from "lucide-react";
import { useId, useState } from "react";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Field, FieldLabel } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { requestMany } from "#/functions/requests.functions";
import type { MediaSummary } from "#/lib/media";
import type { SearchableType } from "#/lib/media-types";
import { mediaKeys } from "#/lib/queries/media";
import { requestKeys } from "#/lib/queries/requests";
import type { MediaAvailability } from "#/lib/request-status";
import { m } from "#/paraglide/messages.js";

type Item = MediaSummary & { availability: MediaAvailability; accepted: boolean | null };

function VolumeOption({
  item,
  isSelected,
  onChange,
}: {
  item: Item;
  isSelected: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  const requestable = item.availability === "none" && item.accepted !== false;
  const position = item.series[0]?.position;
  return (
    <Field orientation="horizontal" data-disabled={!requestable || undefined}>
      <Checkbox id={id} isSelected={isSelected} isDisabled={!requestable} onChange={onChange} />
      <FieldLabel htmlFor={id} className="font-normal">
        {position ? m.collection_volume_title({ position, title: item.title }) : item.title}
      </FieldLabel>
    </Field>
  );
}

/** Seerr's season picker for books: request several volumes of a series at once. */
export function RequestSeriesDialog({ type, items }: { type: SearchableType; items: Item[] }) {
  const requestable = items.filter((i) => i.availability === "none" && i.accepted !== false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => requestable.map((i) => i.externalId));
  const queryClient = useQueryClient();
  const requestFn = useServerFn(requestMany);
  const request = useMutation({
    mutationFn: (ids: string[]) => requestFn({ data: { type, ids } }),
    onSuccess: async (results) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
        queryClient.invalidateQueries({ queryKey: requestKeys.all }),
      ]);
      if (results.every((r) => r.ok)) setOpen(false);
    },
  });
  const failures = request.data?.filter((r) => !r.ok) ?? [];
  if (requestable.length === 0) return null;

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button>
        <DownloadIcon data-icon="inline-start" />
        {m.collection_request_series()}
      </Button>
      <Dialog showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.collection_request_series()}</DialogTitle>
          <DialogDescription>{m.collection_request_series_description()}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onPress={() => setSelected(requestable.map((i) => i.externalId))}
          >
            {m.collection_select_all()}
          </Button>
          <Button size="sm" variant="outline" onPress={() => setSelected([])}>
            {m.collection_select_none()}
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <VolumeOption
              key={item.externalId}
              item={item}
              isSelected={selected.includes(item.externalId)}
              onChange={(on) =>
                setSelected(
                  on
                    ? [...selected, item.externalId]
                    : selected.filter((id) => id !== item.externalId),
                )
              }
            />
          ))}
        </div>
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
        {request.data && failures.length === 0 ? <FormSuccess message={m.action_saved()} /> : null}
        <DialogFooter>
          <DialogClose>{m.action_cancel()}</DialogClose>
          <Button
            isDisabled={request.isPending || selected.length === 0}
            onPress={() => request.mutate(selected)}
          >
            {request.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.collection_request_count({ count: selected.length })}
          </Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  );
}
