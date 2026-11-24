import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useId } from "react";

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
import { FieldDescription, FieldGroup } from "#/components/ui/field";
import { Skeleton } from "#/components/ui/skeleton";
import { Switch } from "#/components/ui/switch";
import { savePodcastDefaults, saveRequestPolicy } from "#/functions/settings.functions";
import { podcastLibrariesQuery, settingsKeys } from "#/lib/queries/settings";
import {
  PodcastDefaultsSchema,
  type PodcastDefaults,
  type RequestPolicy,
} from "#/lib/schemas/settings";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

/** Podcast requests: the default Audiobookshelf library and folder, and whether they need approval. */
export function PodcastSettingsCard({
  current,
  policy,
}: {
  current: PodcastDefaults | null;
  policy: RequestPolicy;
}) {
  const options = useQuery(podcastLibrariesQuery());

  let body: React.ReactNode;
  if (options.isPending) body = <Skeleton className="h-24 w-full" />;
  else if (options.isError)
    body = <FormError message={options.error.message || m.error_generic()} />;
  else if (!options.data.ok) {
    body = (
      <FormError
        message={
          options.data.reason === "not_configured"
            ? m.settings_podcast_defaults_needs_abs()
            : serviceErrorMessage("audiobookshelf", options.data.error)
        }
      />
    );
  } else if (options.data.libraries.length === 0) {
    body = <FormError message={m.settings_podcast_no_library()} />;
  } else {
    body = <DefaultsForm current={current} libraries={options.data.libraries} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{m.settings_podcast_title()}</h2>
        </CardTitle>
        <CardDescription>{m.settings_podcast_description()}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ApprovalSwitch policy={policy} />
        {body}
      </CardContent>
    </Card>
  );
}

function ApprovalSwitch({ policy }: { policy: RequestPolicy }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveRequestPolicy);
  const labelId = useId();
  const save = useMutation({
    mutationFn: (podcastsRequireApproval: boolean) =>
      saveFn({ data: { ...policy, podcastsRequireApproval } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: settingsKeys.services() }),
  });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <Switch
          aria-labelledby={labelId}
          isSelected={save.isPending ? save.variables : policy.podcastsRequireApproval}
          isDisabled={save.isPending}
          onChange={(value) => save.mutate(value)}
        />
        <span id={labelId} className="text-sm font-medium">
          {m.settings_podcast_require_approval()}
        </span>
      </div>
      <FieldDescription>{m.settings_podcast_require_approval_hint()}</FieldDescription>
      <FormError message={save.error ? save.error.message || m.error_generic() : null} />
    </div>
  );
}

type Library = { id: string; name: string; folders: { id: string; path: string }[] };

function DefaultsForm({
  current,
  libraries,
}: {
  current: PodcastDefaults | null;
  libraries: Library[];
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(savePodcastDefaults);
  const save = useMutation({
    mutationFn: (data: PodcastDefaults) => saveFn({ data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.services() }),
  });
  const first = libraries[0];
  const form = useForm({
    defaultValues: {
      libraryId: current?.libraryId ?? first?.id ?? "",
      folderId: current?.folderId ?? first?.folders[0]?.id ?? "",
    },
    validators: { onSubmit: PodcastDefaultsSchema },
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
        <form.Field name="libraryId">
          {(field) => (
            <SelectField
              label={m.field_library()}
              options={libraries.map((l) => ({ id: l.id, label: l.name }))}
              value={field.state.value || null}
              onChange={(libraryId) => {
                field.handleChange(libraryId ?? "");
                // Pick the new library's first folder.
                const folder = libraries.find((l) => l.id === libraryId)?.folders[0];
                form.setFieldValue("folderId", folder?.id ?? "");
              }}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.libraryId}>
          {(libraryId) => (
            <form.Field name="folderId">
              {(field) => (
                <SelectField
                  label={m.field_folder()}
                  options={(libraries.find((l) => l.id === libraryId)?.folders ?? []).map((f) => ({
                    id: f.id,
                    label: f.path,
                  }))}
                  value={field.state.value || null}
                  onChange={(folderId) => field.handleChange(folderId ?? "")}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
          )}
        </form.Subscribe>
      </FieldGroup>
      <CardFooter className="justify-end px-0">
        <Button type="submit" isDisabled={save.isPending}>
          {save.isSuccess ? m.action_saved() : m.action_save()}
        </Button>
      </CardFooter>
    </form>
  );
}
