import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { AuthCard } from "#/components/auth-card";
import { FormError } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { completeSetup } from "#/functions/auth.functions";
import { authKeys } from "#/lib/queries/auth";
import { PASSWORD_MIN_LENGTH, SetupSchema, type SetupInput } from "#/lib/schemas/auth";
import { m } from "#/paraglide/messages.js";

/** First-run wizard: create the admin account. Only reachable while no account exists. */
export const Route = createFileRoute("/setup")({
  beforeLoad: ({ context }) => {
    if (context.authState.setupComplete) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: `${m.setup_title()} · ${m.app_name()}` }] }),
  component: SetupPage,
});

function SetupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const completeSetupFn = useServerFn(completeSetup);

  const setup = useMutation({
    mutationFn: (data: SetupInput) => completeSetupFn({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.all });
      await router.navigate({ to: "/welcome" });
    },
  });

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: { onSubmit: SetupSchema },
    onSubmit: async ({ value }) => {
      await setup.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <AuthCard title={m.setup_title()} description={m.setup_description()}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <FormError message={setup.error ? setup.error.message || m.error_generic() : null} />
          <form.Field name="name">
            {(field) => (
              <TextField
                label={m.field_name()}
                name={field.name}
                autoComplete="name"
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
                autoComplete="email"
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
                description={m.setup_password_hint({ min: PASSWORD_MIN_LENGTH })}
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
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" isDisabled={isSubmitting}>
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                {m.setup_submit()}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
