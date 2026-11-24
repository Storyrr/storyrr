import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";

import { AuthCard } from "#/components/auth-card";
import { FormError, FormSuccess } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";
import { ForgotPasswordSchema } from "#/lib/schemas/profile";
import { m } from "#/paraglide/messages.js";

/** "Forgot password?": emails a reset link (only offered when email is set up). */
export const Route = createFileRoute("/forgot-password")({
  beforeLoad: ({ context }) => {
    if (!context.authState.setupComplete) throw redirect({ to: "/setup" });
    if (context.authState.user) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: `${m.forgot_password_title()} · ${m.app_name()}` }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const send = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });
      if (error) throw new Error(m.error_generic());
    },
  });
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: ForgotPasswordSchema },
    onSubmit: async ({ value }) => {
      await send.mutateAsync(value.email).catch(() => undefined);
    },
  });

  return (
    <AuthCard title={m.forgot_password_title()} description={m.forgot_password_description()}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <FormError message={send.error?.message} />
          {/* The same answer whether the address has an account or not. */}
          {send.isSuccess ? <FormSuccess message={m.forgot_password_sent()} /> : null}
          <form.Field name="email">
            {(field) => (
              <TextField
                label={m.field_email()}
                name={field.name}
                type="email"
                autoComplete="username"
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
                {m.forgot_password_submit()}
              </Button>
            )}
          </form.Subscribe>
          <Link to="/sign-in" className="text-center text-sm text-muted-foreground hover:underline">
            {m.back_to_sign_in()}
          </Link>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
