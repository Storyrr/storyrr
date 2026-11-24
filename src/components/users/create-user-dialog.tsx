import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserPlusIcon } from "lucide-react";
import { useState } from "react";

import { FormError } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { SwitchField } from "#/components/form/switch-field";
import { TextField } from "#/components/form/text-field";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { createUser } from "#/functions/users.functions";
import { userKeys } from "#/lib/queries/users";
import { PASSWORD_MIN_LENGTH } from "#/lib/schemas/auth";
import {
  CreateUserSchema,
  USER_ROLES,
  type CreateUserInput,
  type UserRole,
} from "#/lib/schemas/users";
import { m } from "#/paraglide/messages.js";

import { roleLabels } from "./role-labels";

const isRole = (value: string | null): value is UserRole => USER_ROLES.some((r) => r === value);

/** "Add a user": invite-only accounts, created with a temporary password. */
export function CreateUserDialog({ defaultAutoApprove }: { defaultAutoApprove: boolean }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const createFn = useServerFn(createUser);
  const create = useMutation({
    mutationFn: (data: CreateUserInput) => createFn({ data }),
    onSuccess: async () => {
      setOpen(false);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "user" as UserRole,
      autoApprove: defaultAutoApprove,
    },
    validators: { onSubmit: CreateUserSchema },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      <Button>
        <UserPlusIcon data-icon="inline-start" />
        {m.users_add()}
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
            <DialogTitle>{m.users_add_title()}</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <FormError message={create.error ? create.error.message || m.error_generic() : null} />
            <form.Field name="name">
              {(field) => (
                <TextField
                  label={m.field_name()}
                  name={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
            <form.Field name="email">
              {(field) => (
                <TextField
                  label={m.field_email()}
                  name={field.name}
                  type="email"
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
                  description={m.users_password_hint({ min: PASSWORD_MIN_LENGTH })}
                  name={field.name}
                  type="password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
            <form.Field name="role">
              {(field) => (
                <SelectField
                  label={m.field_role()}
                  options={USER_ROLES.map((r) => ({ id: r, label: roleLabels[r]() }))}
                  value={field.state.value}
                  onChange={(value) => {
                    if (isRole(value)) field.handleChange(value);
                  }}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
            <form.Field name="autoApprove">
              {(field) => (
                <SwitchField
                  label={m.field_auto_approve()}
                  isSelected={field.state.value}
                  onChange={field.handleChange}
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
                  {m.users_add()}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </Dialog>
    </DialogTrigger>
  );
}
