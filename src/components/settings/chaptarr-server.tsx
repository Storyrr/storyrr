import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LibraryBigIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardFooter } from "#/components/ui/card";
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
import { Spinner } from "#/components/ui/spinner";
import { deleteServiceConnection } from "#/functions/settings.functions";
import { chaptarrOptionsQuery, settingsKeys } from "#/lib/queries/settings";
import { CHAPTARR_FORMATS, type ChaptarrFormat, type FormatDefaults } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";

import { ConnectionForm } from "./connection-form";
import { FormatDefaultsForm } from "./format-defaults-form";

type Connection = { url: string; hasApiKey: boolean };
type Defaults = Record<ChaptarrFormat, FormatDefaults | null>;

const formatLabels: Record<ChaptarrFormat, () => string> = {
  audiobook: m.settings_chaptarr_audiobooks,
  ebook: m.settings_chaptarr_ebooks,
};

/** Seerr-like server card: Chaptarr's address and defaults, or a box to add it. */
export function ChaptarrServer({
  current,
  defaults,
}: {
  current: Connection | null;
  defaults: Defaults;
}) {
  const [open, setOpen] = useState(false);
  const dialog = (
    <ChaptarrDialog open={open} onOpenChange={setOpen} current={current} defaults={defaults} />
  );

  if (!current) {
    return (
      <div className="flex min-h-44 w-full max-w-md items-center justify-center rounded-xl border-2 border-dashed p-6">
        <DialogTrigger isOpen={open} onOpenChange={setOpen}>
          <Button variant="outline">
            <PlusIcon data-icon="inline-start" />
            {m.settings_chaptarr_add()}
          </Button>
          {dialog}
        </DialogTrigger>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md gap-0 py-0">
      <CardContent className="flex gap-4 py-5">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h3 className="font-semibold">{m.service_chaptarr()}</h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="font-medium">{m.settings_address()}</dt>
            <dd className="truncate text-muted-foreground">{current.url}</dd>
            {CHAPTARR_FORMATS.map((format) => (
              <DefaultsSummary key={format} format={format} defaults={defaults[format]} />
            ))}
          </dl>
        </div>
        <LibraryBigIcon className="size-10 shrink-0 text-muted-foreground" aria-hidden />
      </CardContent>
      <CardFooter className="grid grid-cols-2 divide-x border-t p-0">
        <DialogTrigger isOpen={open} onOpenChange={setOpen}>
          <Button variant="ghost" className="h-12 rounded-none">
            <PencilIcon data-icon="inline-start" />
            {m.action_edit()}
          </Button>
          {dialog}
        </DialogTrigger>
        <DeleteChaptarrButton />
      </CardFooter>
    </Card>
  );
}

/** "Audiobooks: Folder · Profile", with names from Chaptarr when it answers. */
function DefaultsSummary({
  format,
  defaults,
}: {
  format: ChaptarrFormat;
  defaults: FormatDefaults | null;
}) {
  const options = useQuery({ ...chaptarrOptionsQuery(format), enabled: defaults !== null });
  let value: string = m.settings_not_set();
  if (defaults) {
    const data = options.data?.ok ? options.data : null;
    const folder =
      data?.rootFolders.find((f) => f.path === defaults.rootFolderPath)?.name ??
      defaults.rootFolderPath;
    const profile = data?.qualityProfiles.find((p) => p.id === defaults.qualityProfileId)?.name;
    value = profile ? `${folder} · ${profile}` : folder;
  }
  return (
    <>
      <dt className="font-medium">{formatLabels[format]()}</dt>
      <dd className="truncate text-muted-foreground">{value}</dd>
    </>
  );
}

function ChaptarrDialog({
  open,
  onOpenChange,
  current,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: Connection | null;
  defaults: Defaults;
}) {
  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      showCloseButton={false}
      className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
    >
      <DialogHeader>
        <DialogTitle>
          {current ? m.settings_chaptarr_edit() : m.settings_chaptarr_add()}
        </DialogTitle>
        <DialogDescription>{m.service_chaptarr_description()}</DialogDescription>
      </DialogHeader>
      <ConnectionForm service="chaptarr" current={current} />
      {current ? (
        // Folders and profiles come from the saved connection: shown once it exists.
        <>
          <Separator />
          {CHAPTARR_FORMATS.map((format) => (
            <FormatDefaultsForm
              key={`${format}-${current.url}`}
              format={format}
              current={defaults[format]}
            />
          ))}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {m.settings_audiobook_defaults_needs_chaptarr()}
        </p>
      )}
      <DialogFooter>
        <DialogClose>{m.action_close()}</DialogClose>
      </DialogFooter>
    </Dialog>
  );
}

function DeleteChaptarrButton() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const deleteFn = useServerFn(deleteServiceConnection);
  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { service: "chaptarr" } }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="ghost" className="h-12 rounded-none">
        <Trash2Icon data-icon="inline-start" />
        {m.action_delete()}
      </Button>
      <Dialog showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.settings_chaptarr_delete_title()}</DialogTitle>
          <DialogDescription>{m.settings_chaptarr_delete_description()}</DialogDescription>
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
            {m.action_delete()}
          </Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  );
}
