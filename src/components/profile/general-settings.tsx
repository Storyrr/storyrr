import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type * as v from "valibot";
import { useServerFn } from "@tanstack/react-start";
import { useId } from "react";

import { FormError } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { TextField } from "#/components/form/text-field";
import {
  SettingsActions,
  SettingsRow,
  SettingsSection,
} from "#/components/settings/settings-section";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { updateProfile } from "#/functions/profile.functions";
import { authKeys } from "#/lib/queries/auth";
import { accountQuery, profileKeys } from "#/lib/queries/profile";
import { userKeys } from "#/lib/queries/users";
import { LOCALE_CHOICES, ProfileFormSchema, type LocaleChoice } from "#/lib/schemas/profile";
import { m } from "#/paraglide/messages.js";
import {
  baseLocale,
  cookieName,
  extractLocaleFromNavigator,
  getLocale,
  isLocale,
  setLocale,
  type Locale,
} from "#/paraglide/runtime.js";

/** Each language in its own language, whatever the current one. */
const languageLabels: Record<Locale, () => string> = { en: m.language_en, fr: m.language_fr };

type ProfileForm = v.InferOutput<typeof ProfileFormSchema>;

const isChoice = (value: string | null): value is LocaleChoice =>
  LOCALE_CHOICES.some((choice) => choice === value);

/** Switches the interface to the saved choice ("default": forget the cookie, use the browser's). */
function applyLocale(choice: LocaleChoice) {
  if (choice !== "default") {
    if (choice !== getLocale()) void setLocale(choice);
    return;
  }
  document.cookie = `${cookieName}=; path=/; max-age=0`;
  const browser = extractLocaleFromNavigator() ?? baseLocale;
  if (browser !== getLocale()) window.location.reload();
}

/** General tab: the caller's own account, or (admins) another user's. */
export function GeneralSettings({ userId }: { userId?: string }) {
  const { data: account } = useSuspenseQuery(accountQuery(userId));
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateProfile);
  const emailId = useId();
  const save = useMutation({
    mutationFn: (data: ProfileForm) => updateFn({ data: { ...data, userId } }),
    onSuccess: async (_, data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: authKeys.all }),
        queryClient.invalidateQueries({ queryKey: profileKeys.all }),
        queryClient.invalidateQueries({ queryKey: userKeys.all }),
      ]);
      // Someone else's language applies when they next sign in.
      if (account.self) applyLocale(data.locale);
    },
  });
  const locale: LocaleChoice =
    account.locale && isLocale(account.locale) ? account.locale : "default";
  const form = useForm({
    defaultValues: { name: account.name, email: account.email, locale },
    validators: { onSubmit: ProfileFormSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });
  const browserLocale =
    typeof navigator === "undefined" ? null : (extractLocaleFromNavigator() ?? baseLocale);

  return (
    <SettingsSection title={m.settings_general_title()}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-6"
      >
        <FieldGroup>
          <FormError message={save.error ? save.error.message || m.error_generic() : null} />
          <SettingsRow label={m.field_role()}>
            <p className="text-sm">{account.isAdmin ? m.role_admin() : m.role_user()}</p>
          </SettingsRow>
          <form.Field name="name">
            {(field) => (
              <TextField
                label={m.profile_display_name()}
                layout="row"
                name={field.name}
                autoComplete="name"
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          {account.self ? (
            <SettingsRow
              label={m.field_email()}
              description={m.profile_email_description()}
              htmlFor={emailId}
            >
              <Input id={emailId} readOnly value={account.email} />
            </SettingsRow>
          ) : (
            <form.Field name="email">
              {(field) => (
                <TextField
                  label={m.field_email()}
                  layout="row"
                  type="email"
                  name={field.name}
                  autoComplete="off"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
          )}
          <form.Field name="locale">
            {(field) => (
              <SelectField
                label={m.profile_display_language()}
                layout="row"
                options={LOCALE_CHOICES.map((choice) => ({
                  id: choice,
                  label:
                    choice === "default"
                      ? browserLocale && isLocale(browserLocale)
                        ? m.profile_language_default_named({
                            language: languageLabels[browserLocale](),
                          })
                        : m.profile_language_default()
                      : languageLabels[choice](),
                }))}
                value={field.state.value}
                onChange={(value) => {
                  if (isChoice(value)) field.handleChange(value);
                }}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        </FieldGroup>
        <SettingsActions>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" isDisabled={isSubmitting}>
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                {save.isSuccess ? m.action_saved() : m.action_save()}
              </Button>
            )}
          </form.Subscribe>
        </SettingsActions>
      </form>
    </SettingsSection>
  );
}
