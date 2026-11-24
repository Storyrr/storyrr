import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FormError } from "#/components/form/form-error";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { saveUserSettings } from "#/functions/settings.functions";
import { settingsKeys, userSettingsQuery } from "#/lib/queries/settings";
import { UserSettingsSchema, type UserSettings } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";

import { RequestLimitFields } from "./request-limit-fields";
import { SettingsActions, SettingsRow, SettingsSection } from "./settings-section";

/** Settings → Users: auto-approval default for new accounts, global request limits. */
export function UserSettingsForm() {
  const { data: current } = useSuspenseQuery(userSettingsQuery());
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveUserSettings);
  const save = useMutation({
    mutationFn: (data: UserSettings) => saveFn({ data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.users() }),
  });
  const form = useForm({
    defaultValues: current,
    validators: { onSubmit: UserSettingsSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });

  return (
    <SettingsSection title={m.settings_users_title()} description={m.settings_users_description()}>
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
          <form.Field name="defaultAutoApprove">
            {(field) => (
              <SettingsRow
                label={m.settings_default_auto_approve()}
                description={m.settings_default_auto_approve_description()}
              >
                <Switch
                  aria-label={m.settings_default_auto_approve()}
                  isSelected={field.state.value}
                  onChange={field.handleChange}
                />
              </SettingsRow>
            )}
          </form.Field>
          <form.Field name="requestLimits.audiobook">
            {(field) => (
              <RequestLimitFields
                label={m.settings_limit_audiobook()}
                layout="row"
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="requestLimits.ebook">
            {(field) => (
              <RequestLimitFields
                label={m.settings_limit_ebook()}
                layout="row"
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </FieldGroup>
        <SettingsActions>
          <Button type="submit" isDisabled={save.isPending}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : null}
            {save.isSuccess ? m.action_saved() : m.action_save()}
          </Button>
        </SettingsActions>
      </form>
    </SettingsSection>
  );
}
