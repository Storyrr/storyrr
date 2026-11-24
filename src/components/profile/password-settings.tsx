import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
import { SettingsActions, SettingsSection } from "#/components/settings/settings-section";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { changePassword } from "#/functions/profile.functions";
import { PASSWORD_MIN_LENGTH } from "#/lib/schemas/auth";
import { ChangePasswordFormSchema, type ChangePasswordInput } from "#/lib/schemas/profile";
import { m } from "#/paraglide/messages.js";

export function PasswordSettings() {
  const changeFn = useServerFn(changePassword);
  const change = useMutation({
    mutationFn: (data: ChangePasswordInput) => changeFn({ data }),
  });
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validators: { onSubmit: ChangePasswordFormSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await change
        .mutateAsync({ currentPassword: value.currentPassword, newPassword: value.newPassword })
        .catch(() => null);
      if (!result) return;
      if (!result.ok) {
        // Server-side check: shown on the field it's about.
        formApi.setFieldMeta(result.field, (meta) => ({
          ...meta,
          errorMap: { ...meta.errorMap, onSubmit: [{ message: result.message }] },
        }));
        return;
      }
      formApi.reset();
    },
  });

  const fields = [
    {
      name: "currentPassword",
      label: m.profile_current_password(),
      autoComplete: "current-password",
    },
    {
      name: "newPassword",
      label: m.profile_new_password(),
      autoComplete: "new-password",
      description: m.setup_password_hint({ min: PASSWORD_MIN_LENGTH }),
    },
    { name: "confirmPassword", label: m.profile_confirm_password(), autoComplete: "new-password" },
  ] as const;

  return (
    <SettingsSection
      title={m.profile_password_title()}
      description={m.profile_password_description()}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-6"
      >
        <FieldGroup>
          <FormError message={change.error ? change.error.message || m.error_generic() : null} />
          {change.data?.ok ? <FormSuccess message={m.profile_password_changed()} /> : null}
          {fields.map((f) => (
            <form.Field key={f.name} name={f.name}>
              {(field) => (
                <TextField
                  label={f.label}
                  layout="row"
                  description={"description" in f ? f.description : undefined}
                  name={field.name}
                  type="password"
                  autoComplete={f.autoComplete}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
          ))}
        </FieldGroup>
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
      </form>
    </SettingsSection>
  );
}
