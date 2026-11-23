import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { FormError } from "#/components/form/form-error";
import { SelectField } from "#/components/form/select-field";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { FieldGroup } from "#/components/ui/field";
import { Skeleton } from "#/components/ui/skeleton";
import { saveAudiobookDefaults } from "#/functions/settings.functions";
import { chaptarrAudiobookOptionsQuery, settingsKeys } from "#/lib/queries/settings";
import { AudiobookDefaultsSchema, type AudiobookDefaults } from "#/lib/schemas/settings";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

export function AudiobookDefaultsCard({ current }: { current: AudiobookDefaults | null }) {
  const options = useQuery(chaptarrAudiobookOptionsQuery());

  let body: React.ReactNode;
  if (options.isPending) {
    body = <Skeleton className="h-32 w-full" />;
  } else if (options.isError) {
    body = <FormError message={options.error.message || m.error_generic()} />;
  } else if (!options.data.ok) {
    body = (
      <FormError
        message={
          options.data.reason === "not_configured"
            ? m.settings_audiobook_defaults_needs_chaptarr()
            : serviceErrorMessage("chaptarr", options.data.error)
        }
      />
    );
  } else {
    body = <DefaultsForm current={current} options={options.data} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{m.settings_audiobook_defaults_title()}</h2>
        </CardTitle>
        <CardDescription>{m.settings_audiobook_defaults_description()}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

type Options = {
  rootFolders: { path: string; name: string }[];
  qualityProfiles: { id: number; name: string }[];
  metadataProfiles: { id: number; name: string }[];
};

const idOptions = (items: { id: number; name: string }[]) =>
  items.map((item) => ({ id: String(item.id), label: item.name }));

function DefaultsForm({
  current,
  options,
}: {
  current: AudiobookDefaults | null;
  options: Options;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveAudiobookDefaults);
  const save = useMutation({
    mutationFn: (data: AudiobookDefaults) => saveFn({ data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.services() }),
  });
  const form = useForm({
    defaultValues: {
      rootFolderPath: current?.rootFolderPath ?? options.rootFolders[0]?.path ?? "",
      qualityProfileId: current?.qualityProfileId ?? options.qualityProfiles[0]?.id ?? Number.NaN,
      metadataProfileId:
        current?.metadataProfileId ?? options.metadataProfiles[0]?.id ?? Number.NaN,
    },
    validators: { onSubmit: AudiobookDefaultsSchema },
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
        <form.Field name="rootFolderPath">
          {(field) => (
            <SelectField
              label={m.field_root_folder()}
              options={options.rootFolders.map((f) => ({
                id: f.path,
                label: `${f.name} (${f.path})`,
              }))}
              value={field.state.value || null}
              onChange={(value) => field.handleChange(value ?? "")}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Field name="qualityProfileId">
          {(field) => (
            <SelectField
              label={m.field_quality_profile()}
              options={idOptions(options.qualityProfiles)}
              value={Number.isNaN(field.state.value) ? null : String(field.state.value)}
              onChange={(value) => field.handleChange(value === null ? Number.NaN : Number(value))}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Field name="metadataProfileId">
          {(field) => (
            <SelectField
              label={m.field_metadata_profile()}
              options={idOptions(options.metadataProfiles)}
              value={Number.isNaN(field.state.value) ? null : String(field.state.value)}
              onChange={(value) => field.handleChange(value === null ? Number.NaN : Number(value))}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
      </FieldGroup>
      <CardFooter className="justify-end px-0">
        <Button type="submit" isDisabled={save.isPending}>
          {save.isSuccess ? m.action_saved() : m.action_save()}
        </Button>
      </CardFooter>
    </form>
  );
}
