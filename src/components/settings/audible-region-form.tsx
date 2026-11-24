import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { FormError } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { Button } from "#/components/ui/button";
import { SettingsActions } from "#/components/settings/settings-section";
import { FieldGroup } from "#/components/ui/field";
import { saveMetadataSettings } from "#/functions/settings.functions";
import { AUDIBLE_REGION_CODES, type AudibleRegion } from "#/lib/audible-regions";
import { settingsKeys } from "#/lib/queries/settings";
import { MetadataSettingsSchema, type MetadataSettings } from "#/lib/schemas/settings";
import { m } from "#/paraglide/messages.js";

const regionNames: Record<AudibleRegion, () => string> = {
  us: m.audible_region_us,
  ca: m.audible_region_ca,
  uk: m.audible_region_uk,
  au: m.audible_region_au,
  fr: m.audible_region_fr,
  de: m.audible_region_de,
  it: m.audible_region_it,
  es: m.audible_region_es,
  in: m.audible_region_in,
  jp: m.audible_region_jp,
};

const isRegion = (value: string | null): value is AudibleRegion =>
  v.is(v.picklist(AUDIBLE_REGION_CODES), value);

/** Audible marketplace used for audiobook search and Discover. */
export function AudibleRegionForm({ current }: { current: MetadataSettings }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveMetadataSettings);
  const save = useMutation({
    mutationFn: (data: MetadataSettings) => saveFn({ data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
  const form = useForm({
    defaultValues: current,
    validators: { onSubmit: MetadataSettingsSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
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
        <form.Field name="audibleRegion">
          {(field) => (
            <SelectField
              label={m.field_audible_region()}
              layout="row"
              description={m.settings_metadata_description()}
              options={AUDIBLE_REGION_CODES.map((code) => ({
                id: code,
                label: regionNames[code](),
              }))}
              value={field.state.value}
              onChange={(value) => {
                if (isRegion(value)) field.handleChange(value);
              }}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
      </FieldGroup>
      <SettingsActions>
        <Button type="submit" isDisabled={save.isPending}>
          {save.isSuccess ? m.action_saved() : m.action_save()}
        </Button>
      </SettingsActions>
    </form>
  );
}
