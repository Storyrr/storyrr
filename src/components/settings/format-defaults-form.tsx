import { useForm } from "@tanstack/react-form";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FormError } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { saveFormatDefaults } from "#/functions/settings.functions";
import { chaptarrOptionsQuery, settingsKeys } from "#/lib/queries/settings";
import {
  CHAPTARR_FORMATS,
  FormatDefaultsSchema,
  type ChaptarrFormat,
  type FormatDefaults,
} from "#/lib/schemas/settings";
import { chaptarrOptionsErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

const copy: Record<ChaptarrFormat, { title: () => string; description: () => string }> = {
  audiobook: {
    title: m.settings_audiobook_defaults_title,
    description: m.settings_audiobook_defaults_description,
  },
  ebook: {
    title: m.settings_ebook_defaults_title,
    description: m.settings_ebook_defaults_description,
  },
};

type Options = {
  rootFolders: { path: string; name: string }[];
  qualityProfiles: { id: number; name: string }[];
  metadataProfiles: { id: number; name: string }[];
};

type Defaults = Record<ChaptarrFormat, FormatDefaults | null>;

const idOptions = (items: { id: number; name: string }[]) =>
  items.map((item) => ({ id: String(item.id), label: item.name }));

/**
 * Default root folder and Chaptarr profiles of both formats (in the Chaptarr
 * dialog), saved together with one button so neither is forgotten.
 */
export function FormatDefaultsForm({ current }: { current: Defaults }) {
  const [audiobook, ebook] = useQueries({
    queries: CHAPTARR_FORMATS.map((format) => chaptarrOptionsQuery(format)),
  });
  const results = { audiobook, ebook };
  if (CHAPTARR_FORMATS.some((format) => results[format]?.isPending)) {
    return <Skeleton className="h-64 w-full" />;
  }
  const options: Partial<Record<ChaptarrFormat, Options>> = {};
  const errors: Partial<Record<ChaptarrFormat, string>> = {};
  for (const format of CHAPTARR_FORMATS) {
    const result = results[format];
    const data = result?.data;
    if (data?.ok) options[format] = data;
    else if (data) errors[format] = chaptarrOptionsErrorMessage(data);
    else errors[format] = result?.error?.message || m.error_generic();
  }
  return <DefaultsForm current={current} options={options} errors={errors} />;
}

function DefaultsForm({
  current,
  options,
  errors,
}: {
  current: Defaults;
  options: Partial<Record<ChaptarrFormat, Options>>;
  errors: Partial<Record<ChaptarrFormat, string>>;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveFormatDefaults);
  // Formats whose options Chaptarr listed; the others show their error and aren't
  // saved. Fields validate themselves, so a format left out isn't checked.
  const editable = CHAPTARR_FORMATS.filter((format) => options[format]);
  const initial = (format: ChaptarrFormat): FormatDefaults => {
    const o = options[format];
    const c = current[format];
    return {
      rootFolderPath: c?.rootFolderPath ?? o?.rootFolders[0]?.path ?? "",
      qualityProfileId: c?.qualityProfileId ?? o?.qualityProfiles[0]?.id ?? Number.NaN,
      metadataProfileId: c?.metadataProfileId ?? o?.metadataProfiles[0]?.id ?? Number.NaN,
    };
  };
  const save = useMutation({
    mutationFn: (data: Partial<Record<ChaptarrFormat, FormatDefaults>>) => saveFn({ data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
  const form = useForm({
    defaultValues: { audiobook: initial("audiobook"), ebook: initial("ebook") },
    onSubmit: async ({ value }) => {
      const data = Object.fromEntries(editable.map((format) => [format, value[format]]));
      await save.mutateAsync(data).catch(() => undefined);
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-8"
    >
      <FormError message={save.error ? save.error.message || m.error_generic() : null} />
      {CHAPTARR_FORMATS.map((format) => {
        const o = options[format];
        return (
          <section key={format} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="font-medium">{copy[format].title()}</h3>
              <p className="text-sm text-muted-foreground">{copy[format].description()}</p>
            </div>
            {o ? (
              <FieldGroup>
                <form.Field
                  name={`${format}.rootFolderPath`}
                  validators={{ onSubmit: FormatDefaultsSchema.entries.rootFolderPath }}
                >
                  {(field) => (
                    <SelectField
                      label={m.field_root_folder()}
                      options={o.rootFolders.map((f) => ({
                        id: f.path,
                        label: `${f.name} (${f.path})`,
                      }))}
                      value={field.state.value || null}
                      onChange={(value) => field.handleChange(value ?? "")}
                      errors={field.state.meta.errors}
                    />
                  )}
                </form.Field>
                <form.Field
                  name={`${format}.qualityProfileId`}
                  validators={{ onSubmit: FormatDefaultsSchema.entries.qualityProfileId }}
                >
                  {(field) => (
                    <SelectField
                      label={m.field_quality_profile()}
                      options={idOptions(o.qualityProfiles)}
                      value={Number.isNaN(field.state.value) ? null : String(field.state.value)}
                      onChange={(value) =>
                        field.handleChange(value === null ? Number.NaN : Number(value))
                      }
                      errors={field.state.meta.errors}
                    />
                  )}
                </form.Field>
                <form.Field
                  name={`${format}.metadataProfileId`}
                  validators={{ onSubmit: FormatDefaultsSchema.entries.metadataProfileId }}
                >
                  {(field) => (
                    <SelectField
                      label={m.field_metadata_profile()}
                      options={idOptions(o.metadataProfiles)}
                      value={Number.isNaN(field.state.value) ? null : String(field.state.value)}
                      onChange={(value) =>
                        field.handleChange(value === null ? Number.NaN : Number(value))
                      }
                      errors={field.state.meta.errors}
                    />
                  )}
                </form.Field>
              </FieldGroup>
            ) : (
              <FormError message={errors[format] ?? m.error_generic()} />
            )}
          </section>
        );
      })}
      {editable.length > 0 ? (
        <div className="flex justify-end">
          <Button type="submit" isDisabled={save.isPending}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : null}
            {save.isSuccess ? m.action_saved() : m.action_save()}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
