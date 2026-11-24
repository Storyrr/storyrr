import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import * as v from "valibot";

import { AuthCard } from "#/components/auth-card";
import { FormError } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";
import { authKeys } from "#/lib/queries/auth";
import { safeRedirectPath } from "#/lib/redirect";
import { SignInSchema, type SignInInput } from "#/lib/schemas/auth";
import { m } from "#/paraglide/messages.js";

const SearchSchema = v.object({
  redirect: v.optional(v.string()),
});

export const Route = createFileRoute("/sign-in")({
  validateSearch: SearchSchema,
  beforeLoad: ({ context, search }) => {
    if (!context.authState.setupComplete) throw redirect({ to: "/setup" });
    if (context.authState.user) throw redirect({ href: safeRedirectPath(search.redirect) });
  },
  head: () => ({ meta: [{ title: `${m.sign_in_title()} · ${m.app_name()}` }] }),
  component: SignInPage,
});

function SignInPage() {
  const router = useRouter();
  const { passwordReset } = Route.useRouteContext().authState;
  const queryClient = useQueryClient();
  const search = Route.useSearch();

  const signIn = useMutation({
    mutationFn: async (data: SignInInput) => {
      const { error } = await authClient.signIn.email(data);
      if (error) {
        throw new Error(error.status === 401 ? m.sign_in_failed() : m.error_generic());
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.all });
      await router.navigate({ href: safeRedirectPath(search.redirect) });
    },
  });

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: SignInSchema },
    onSubmit: async ({ value }) => {
      await signIn.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <AuthCard title={m.sign_in_title()} description={m.sign_in_description()}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup>
          <FormError message={signIn.error?.message} />
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
          {passwordReset ? (
            <Link
              to="/forgot-password"
              className="-mb-4 self-end text-sm text-muted-foreground hover:underline"
            >
              {m.forgot_password_link()}
            </Link>
          ) : null}
          <form.Field name="password">
            {(field) => (
              <TextField
                label={m.field_password()}
                name={field.name}
                type="password"
                autoComplete="current-password"
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
                {m.sign_in_submit()}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
