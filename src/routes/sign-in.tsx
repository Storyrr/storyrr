import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

import { AuthCard } from "#/components/auth-card";
import { FormError } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
import { Button } from "#/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { authClient } from "#/lib/auth-client";
import { MediaServerSignInSchema, type MediaServer } from "#/lib/media-server-login";
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
  const { mediaServerSignIn } = Route.useRouteContext().authState;
  const [method, setMethod] = useState<"local" | MediaServer>("local");
  return (
    <AuthCard title={m.sign_in_title()} description={m.sign_in_description()}>
      <div className="flex flex-col gap-6">
        {mediaServerSignIn.length > 0 ? (
          <ToggleGroup
            aria-label={m.sign_in_with()}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[method]}
            onSelectionChange={(keys) => {
              const key = [...keys][0];
              const server = mediaServerSignIn.find((s) => s === key);
              setMethod(server ?? "local");
            }}
            variant="outline"
            className="w-full flex-wrap"
          >
            <ToggleGroupItem id="local" className="flex-1">
              {m.sign_in_method_local()}
            </ToggleGroupItem>
            {mediaServerSignIn.map((server) => (
              <ToggleGroupItem key={server} id={server} className="flex-1">
                {serverNames[server]()}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        {method === "local" ? <LocalSignIn /> : <MediaServerSignIn key={method} server={method} />}
      </div>
    </AuthCard>
  );
}

const serverNames: Record<MediaServer, () => string> = {
  audiobookshelf: m.service_audiobookshelf,
  kavita: m.service_kavita,
  komga: m.service_komga,
  jellyfin: m.service_jellyfin,
};

function useSignedIn() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: authKeys.all });
    await router.navigate({ href: safeRedirectPath(search.redirect) });
  };
}

const signInErrors: Record<string, () => string> = {
  DISABLED: m.sign_in_error_disabled,
  INVALID: m.sign_in_error_invalid,
  NO_ACCOUNT: m.sign_in_error_no_account,
  UNREACHABLE: m.sign_in_error_unreachable,
};

/** Sign in with a media-server account (username, or email for Komga, and password on that server). */
function MediaServerSignIn({ server }: { server: MediaServer }) {
  const signedIn = useSignedIn();
  const signIn = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const { error } = await authClient.$fetch("/sign-in/media-server", {
        method: "POST",
        body: { server, ...data },
      });
      if (error) {
        // The plugin answers with the reason as the message ("invalid", "no_account"…).
        throw new Error((signInErrors[(error.message ?? "").toUpperCase()] ?? m.error_generic)());
      }
    },
    onSuccess: signedIn,
  });
  const form = useForm({
    defaultValues: { username: "", password: "" },
    validators: {
      onSubmit: v.object({
        username: MediaServerSignInSchema.entries.username,
        password: MediaServerSignInSchema.entries.password,
      }),
    },
    onSubmit: async ({ value }) => {
      await signIn.mutateAsync(value).catch(() => undefined);
    },
  });
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <FormError message={signIn.error?.message} />
        <form.Field name="username">
          {(field) => (
            <TextField
              // Komga accounts sign in with their email.
              label={server === "komga" ? m.field_email() : m.field_username()}
              name={field.name}
              autoComplete="username"
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
  );
}

/** Email and password of a Storyrr account. */
function LocalSignIn() {
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
  );
}
