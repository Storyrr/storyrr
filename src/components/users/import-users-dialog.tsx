import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DownloadIcon } from "lucide-react";
import { useId, useState } from "react";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
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
import { Field, FieldDescription, FieldLabel } from "#/components/ui/field";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { getImportableUsers, importUsers } from "#/functions/users.functions";
import { MEDIA_SERVERS, type MediaServer } from "#/lib/media-server-login";
import { userKeys } from "#/lib/queries/users";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

const serverNames: Record<MediaServer, () => string> = {
  audiobookshelf: m.service_audiobookshelf,
  kavita: m.service_kavita,
  komga: m.service_komga,
  jellyfin: m.service_jellyfin,
};

function AccountOption({
  account,
  isSelected,
  onChange,
}: {
  account: { key: string; name: string; email: string | null; imported: boolean };
  isSelected: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal" data-disabled={account.imported || undefined}>
      <Checkbox
        id={id}
        isSelected={isSelected || account.imported}
        isDisabled={account.imported}
        onChange={onChange}
      />
      <div className="flex flex-col">
        <FieldLabel htmlFor={id}>{account.name}</FieldLabel>
        <FieldDescription>
          {account.imported ? m.users_import_already() : (account.email ?? "")}
        </FieldDescription>
      </div>
    </Field>
  );
}

/** Seerr's "Import Plex users", for Audiobookshelf and Kavita. */
export function ImportUsersDialog() {
  const [open, setOpen] = useState(false);
  const [server, setServer] = useState<MediaServer>("audiobookshelf");
  const [selected, setSelected] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const listFn = useServerFn(getImportableUsers);
  const importFn = useServerFn(importUsers);
  const accounts = useQuery({
    queryKey: [...userKeys.all, "importable", server] as const,
    queryFn: () => listFn({ data: { server } }),
    enabled: open,
  });
  const run = useMutation({
    mutationFn: () => importFn({ data: { server, keys: selected } }),
    onSuccess: async () => {
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
  const data = accounts.data?.ok ? accounts.data.users : null;

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button variant="outline">
        <DownloadIcon data-icon="inline-start" />
        {m.users_import()}
      </Button>
      <Dialog showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.users_import_title()}</DialogTitle>
          <DialogDescription>
            {m.users_import_description({ server: serverNames[server]() })}
          </DialogDescription>
        </DialogHeader>
        <SelectField
          label={m.users_import_server()}
          options={MEDIA_SERVERS.map((s) => ({ id: s, label: serverNames[s]() }))}
          value={server}
          onChange={(value) => {
            const next = MEDIA_SERVERS.find((s) => s === value);
            if (next) {
              setServer(next);
              setSelected([]);
            }
          }}
        />
        {accounts.isPending ? <Skeleton className="h-24 w-full" /> : null}
        {accounts.data && !accounts.data.ok ? (
          <FormError message={serviceErrorMessage(server, accounts.data.error)} />
        ) : null}
        {data ? (
          <div className="flex flex-col gap-3">
            {data.map((account) => (
              <AccountOption
                key={account.key}
                account={account}
                isSelected={selected.includes(account.key)}
                onChange={(on) =>
                  setSelected(
                    on ? [...selected, account.key] : selected.filter((k) => k !== account.key),
                  )
                }
              />
            ))}
          </div>
        ) : null}
        <FormError message={run.error ? run.error.message || m.error_generic() : null} />
        {run.data ? (
          <FormSuccess message={m.users_import_done({ count: run.data.imported })} />
        ) : null}
        <DialogFooter>
          <DialogClose>{m.action_close()}</DialogClose>
          <Button isDisabled={run.isPending || selected.length === 0} onPress={() => run.mutate()}>
            {run.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.users_import_submit({ count: selected.length })}
          </Button>
        </DialogFooter>
      </Dialog>
    </DialogTrigger>
  );
}
