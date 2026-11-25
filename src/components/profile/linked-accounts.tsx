import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LinkIcon, UnlinkIcon } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import { FormError } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
import { SettingsSection } from "#/components/settings/settings-section";
import { Badge } from "#/components/ui/badge";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { linkMediaServer, unlinkMediaServer } from "#/functions/profile.functions";
import {
  MEDIA_SERVER_NAMES,
  MediaServerSignInSchema,
  mediaServerErrorMessage,
  type MediaServer,
} from "#/lib/media-server-login";
import { linkedAccountsQuery, profileKeys } from "#/lib/queries/profile";
import { m } from "#/paraglide/messages.js";

/**
 * Linked accounts tab (one's own): link a media-server account to sign in
 * with it. Its password proves it's yours; Storyrr never links by email.
 */
export function LinkedAccounts() {
  const { data: servers } = useSuspenseQuery(linkedAccountsQuery());
  return (
    <SettingsSection
      title={m.linked_accounts_title()}
      description={m.linked_accounts_description()}
    >
      {servers.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{m.linked_accounts_none_title()}</EmptyTitle>
            <EmptyDescription>{m.linked_accounts_none_description()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex max-w-2xl flex-col divide-y rounded-lg border">
          {servers.map(({ server, linked }) => (
            <li key={server} className="flex flex-wrap items-center gap-3 p-4">
              <span className="font-medium">{MEDIA_SERVER_NAMES[server]()}</span>
              <Badge variant={linked ? "default" : "outline"}>
                {linked ? m.linked_account_linked() : m.linked_account_not_linked()}
              </Badge>
              <span className="ms-auto">
                {linked ? <UnlinkButton server={server} /> : <LinkDialog server={server} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function UnlinkButton({ server }: { server: MediaServer }) {
  const queryClient = useQueryClient();
  const unlinkFn = useServerFn(unlinkMediaServer);
  const unlink = useMutation({
    mutationFn: () => unlinkFn({ data: { server } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKeys.linkedAccounts() }),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      isDisabled={unlink.isPending}
      onPress={() => unlink.mutate()}
    >
      {unlink.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <UnlinkIcon data-icon="inline-start" />
      )}
      {m.linked_account_unlink()}
    </Button>
  );
}

const LinkFormSchema = v.object({
  username: MediaServerSignInSchema.entries.username,
  password: MediaServerSignInSchema.entries.password,
});

function LinkDialog({ server }: { server: MediaServer }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const linkFn = useServerFn(linkMediaServer);
  const link = useMutation({
    mutationFn: async (data: v.InferOutput<typeof LinkFormSchema>) => {
      const result = await linkFn({ data: { server, ...data } });
      if (!result.ok) throw new Error(mediaServerErrorMessage(result.error));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: profileKeys.linkedAccounts() });
      setOpen(false);
    },
  });
  const form = useForm({
    defaultValues: { username: "", password: "" },
    validators: { onSubmit: LinkFormSchema },
    onSubmit: async ({ value }) => {
      await link.mutateAsync(value).catch(() => undefined);
    },
  });
  const name = MEDIA_SERVER_NAMES[server]();
  return (
    <DialogTrigger
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
          link.reset();
        }
      }}
    >
      <Button size="sm">
        <LinkIcon data-icon="inline-start" />
        {m.linked_account_link()}
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
            <DialogTitle>{m.linked_account_link_title({ server: name })}</DialogTitle>
            <DialogDescription>
              {m.linked_account_link_description({ server: name })}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <FormError message={link.error?.message} />
            <form.Field name="username">
              {(field) => (
                <TextField
                  // Komga accounts sign in with their email.
                  label={server === "komga" ? m.field_email() : m.field_username()}
                  name={field.name}
                  autoComplete="off"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <TextField
                  label={m.field_password()}
                  name={field.name}
                  type="password"
                  autoComplete="off"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose>{m.action_cancel()}</DialogClose>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" isDisabled={isSubmitting}>
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  {m.linked_account_link()}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </Dialog>
    </DialogTrigger>
  );
}
