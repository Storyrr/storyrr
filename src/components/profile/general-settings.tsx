import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type * as v from "valibot";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { Spinner } from "#/components/ui/spinner";
import { updateProfile } from "#/functions/profile.functions";
import { authKeys } from "#/lib/queries/auth";
import { accountQuery, profileKeys } from "#/lib/queries/profile";
import { userKeys } from "#/lib/queries/users";
import { LOCALE_CHOICES, ProfileFormSchema, type LocaleChoice } from "#/lib/schemas/profile";
import { isPlaceholderEmail } from "#/lib/emails";
import { ReadOnlyNotice } from "#/components/profile/read-only-notice";
import { roleLabel } from "#/components/users/role-labels";
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
const languageLabels: Record<Locale, () => string> = {
  en: m.language_en,
  fr: m.language_fr,
  de: m.language_de,
  es: m.language_es,
};

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
  const save = useMutation({
    mutationFn: (data: ProfileForm) => updateFn({ data: { ...data, userId } }),
    onSuccess: async (result, data) => {
      if (!result.ok) return;
      toast.success(m.action_saved());
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
    defaultValues: {
      name: account.name,
      // A made-up address (media-server account without one) starts blank, to be filled in.
      email: isPlaceholderEmail(account.email) ? "" : account.email,
      locale,
    },
    validators: { onSubmit: ProfileFormSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await save.mutateAsync(value).catch(() => null);
      // Server-side check (email already used): shown on its field.
      if (result && !result.ok)
        formApi.setFieldMeta(result.field, (meta) => ({
          ...meta,
          errorMap: { ...meta.errorMap, onSubmit: [{ message: result.message }] },
        }));
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
          {account.editable ? null : <ReadOnlyNotice account={account} />}
          <FormError message={save.error ? save.error.message || m.error_generic() : null} />
          <SettingsRow label={m.field_role()}>
            <p className="text-sm">{roleLabel(account)}</p>
          </SettingsRow>
          <form.Field name="name">
            {(field) => (
              <TextField
                label={m.profile_display_name()}
                layout="row"
                name={field.name}
                autoComplete="name"
                disabled={!account.editable}
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
                layout="row"
                description={account.self ? m.profile_email_own_description() : undefined}
                type="email"
                name={field.name}
                autoComplete={account.self ? "email" : "off"}
                disabled={!account.editable}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
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
                disabled={!account.editable}
                onChange={(value) => {
                  if (isChoice(value)) field.handleChange(value);
                }}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        </FieldGroup>
        {account.editable ? (
          <SettingsActions>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" isDisabled={isSubmitting}>
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  {m.action_save()}
                </Button>
              )}
            </form.Subscribe>
          </SettingsActions>
        ) : null}
      </form>
    </SettingsSection>
  );
}
