import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
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
import { profileKeys } from "#/lib/queries/profile";
import {
  LOCALE_CHOICES,
  ProfileSchema,
  type LocaleChoice,
  type ProfileInput,
} from "#/lib/schemas/profile";
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

export function GeneralSettings() {
  const { user } = useRouteContext({ from: "/_authed" });
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updateProfile);
  const emailId = useId();
  const save = useMutation({
    mutationFn: (data: ProfileInput) => updateFn({ data }),
    onSuccess: async (_, data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: authKeys.all }),
        queryClient.invalidateQueries({ queryKey: profileKeys.all }),
      ]);
      applyLocale(data.locale);
    },
  });
  const locale: LocaleChoice = user.locale && isLocale(user.locale) ? user.locale : "default";
  const form = useForm({
    defaultValues: { name: user.name, locale },
    validators: { onSubmit: ProfileSchema },
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
            <p className="text-sm">{user.isAdmin ? m.role_admin() : m.role_user()}</p>
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
          <SettingsRow
            label={m.field_email()}
            description={m.profile_email_description()}
            htmlFor={emailId}
          >
            <Input id={emailId} readOnly value={user.email} />
          </SettingsRow>
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
