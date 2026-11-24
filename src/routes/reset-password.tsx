import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import { AuthCard } from "#/components/auth-card";
import { FormError, FormSuccess } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";
import { PASSWORD_MIN_LENGTH } from "#/lib/schemas/auth";
import { ResetPasswordFormSchema } from "#/lib/schemas/profile";
import { m } from "#/paraglide/messages.js";

/** Where the reset email's link lands (better-auth adds `token`, or `error` when it's invalid). */
export const Route = createFileRoute("/reset-password")({
  validateSearch: v.object({ token: v.optional(v.string()), error: v.optional(v.string()) }),
  beforeLoad: ({ context }) => {
    if (context.authState.user) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: `${m.reset_password_title()} · ${m.app_name()}` }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error } = Route.useSearch();
  const reset = useMutation({
    mutationFn: async (newPassword: string) => {
      if (!token) throw new Error(m.reset_password_invalid());
      const result = await authClient.resetPassword({ newPassword, token });
      if (result.error) throw new Error(m.reset_password_invalid());
    },
  });
  const form = useForm({
    defaultValues: { newPassword: "", confirmPassword: "" },
    validators: { onSubmit: ResetPasswordFormSchema },
    onSubmit: async ({ value }) => {
      await reset.mutateAsync(value.newPassword).catch(() => undefined);
    },
  });
  const invalid = !token || Boolean(error);

  return (
    <AuthCard title={m.reset_password_title()} description={m.reset_password_description()}>
      {invalid ? (
        <div className="flex flex-col gap-4">
          <FormError message={m.reset_password_invalid()} />
          <Link to="/forgot-password" className="text-sm hover:underline">
            {m.forgot_password_link()}
          </Link>
        </div>
      ) : reset.isSuccess ? (
        <div className="flex flex-col gap-4">
          <FormSuccess message={m.reset_password_done()} />
          <Link to="/sign-in" className="text-sm hover:underline">
            {m.back_to_sign_in()}
          </Link>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <FormError message={reset.error?.message} />
            <form.Field name="newPassword">
              {(field) => (
                <TextField
                  label={m.profile_new_password()}
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
            <form.Field name="confirmPassword">
              {(field) => (
                <TextField
                  label={m.profile_confirm_password()}
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
                  {m.reset_password_submit()}
                </Button>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      )}
    </AuthCard>
  );
}
