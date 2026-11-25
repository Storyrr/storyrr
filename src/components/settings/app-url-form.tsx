import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { toast } from "sonner";

import { FormError } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
import { SettingsActions } from "#/components/settings/settings-section";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { saveAppUrl } from "#/functions/settings.functions";
import { settingsKeys } from "#/lib/queries/settings";
import { AppUrlSchema } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";

const FormSchema = v.object({ url: AppUrlSchema });

/**
 * The application URL: where links in emails and notifications point (e.g. a
 * tunnel's address). Storyrr keeps working at its other addresses.
 */
export function AppUrlForm({ value, fromEnv }: { value: string | null; fromEnv: boolean }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveAppUrl);
  const save = useMutation({
    mutationFn: (data: { url: string }) => saveFn({ data }),
    onSuccess: () => {
      toast.success(m.action_saved());
      return queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
  const form = useForm({
    defaultValues: { url: value ?? "" },
    validators: { onSubmit: FormSchema },
    onSubmit: async ({ value: input }) => {
      await save.mutateAsync(v.parse(FormSchema, input)).catch(() => undefined);
    },
  });

  return (
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
        <form.Field name="url">
          {(field) => (
            <TextField
              label={m.settings_app_url()}
              layout="row"
              description={
                fromEnv
                  ? `${m.settings_app_url_description()} ${m.settings_app_url_from_env()}`
                  : m.settings_app_url_description()
              }
              name={field.name}
              placeholder="https://storyrr.example.com"
              disabled={fromEnv}
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
      </FieldGroup>
      {fromEnv ? null : (
        <SettingsActions>
          <Button type="submit" isDisabled={save.isPending}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.action_save()}
          </Button>
        </SettingsActions>
      )}
    </form>
  );
}
