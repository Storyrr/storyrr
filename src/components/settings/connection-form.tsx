import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { SecretField } from "#/components/form/secret-field";
import { TextField } from "#/components/form/text-field";
import { Button } from "#/components/ui/button";
import { SettingsActions } from "#/components/settings/settings-section";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import {
  revealSecret,
  saveServiceConnection,
  testServiceConnection,
} from "#/functions/settings.functions";
import { settingsKeys } from "#/lib/queries/settings";
import {
  ConnectionFormSchema,
  type ConnectionForm,
  type ServiceName,
} from "#/lib/schemas/settings";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

type Feedback = { tone: "success" | "error"; message: string } | null;

/** URL + API key of a service, with Test and Save (a blank key keeps the stored one). */
/** The connection test's success message of each media server. */
const libraryTestMessages: Record<
  Exclude<ServiceName, "chaptarr">,
  (inputs: { count: number }) => string
> = {
  audiobookshelf: m.test_ok_audiobookshelf,
  kavita: m.test_ok_kavita,
  komga: m.test_ok_komga,
  jellyfin: m.test_ok_jellyfin,
};

export function ConnectionForm({
  service,
  current,
  layout = "stacked",
  onSaved,
}: {
  service: ServiceName;
  current: { url: string; hasApiKey: boolean } | null;
  layout?: "stacked" | "row";
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const testFn = useServerFn(testServiceConnection);
  const saveFn = useServerFn(saveServiceConnection);
  const revealFn = useServerFn(revealSecret);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const test = useMutation({
    mutationFn: (connection: ConnectionForm) => testFn({ data: { service, connection } }),
    onMutate: () => setFeedback(null),
    onSuccess: (result) => {
      if (!result.ok)
        return setFeedback({ tone: "error", message: serviceErrorMessage(service, result.error) });
      setFeedback({
        tone: "success",
        message:
          service === "chaptarr"
            ? [
                m.test_ok_chaptarr({ version: result.version ?? "" }),
                ...(result.warnings ?? []).map((warning) => m.test_chaptarr_warning({ warning })),
              ].join(" ")
            : libraryTestMessages[service]({ count: result.libraries ?? 0 }),
      });
    },
    onError: (error) => setFeedback({ tone: "error", message: error.message || m.error_generic() }),
  });

  const save = useMutation({
    mutationFn: (connection: ConnectionForm) => saveFn({ data: { service, connection } }),
    onMutate: () => setFeedback(null),
    onSuccess: async () => {
      setFeedback({ tone: "success", message: m.action_saved() });
      await queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      onSaved?.();
    },
    onError: (error) => setFeedback({ tone: "error", message: error.message || m.error_generic() }),
  });

  const form = useForm({
    defaultValues: { url: current?.url ?? "", apiKey: "" },
    validators: { onSubmit: ConnectionFormSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });

  const runTest = async () => {
    await form.validate("submit");
    if (!form.state.isValid) return;
    test.mutate(form.state.values);
  };

  const buttons = (
    <>
      <Button variant="outline" isDisabled={test.isPending} onPress={() => void runTest()}>
        {test.isPending ? <Spinner data-icon="inline-start" /> : null}
        {m.action_test()}
      </Button>
      <Button type="submit" isDisabled={save.isPending}>
        {save.isPending ? <Spinner data-icon="inline-start" /> : null}
        {m.action_save()}
      </Button>
    </>
  );

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
        {feedback?.tone === "error" ? <FormError message={feedback.message} /> : null}
        {feedback?.tone === "success" ? <FormSuccess message={feedback.message} /> : null}
        <form.Field name="url">
          {(field) => (
            <TextField
              label={m.field_url()}
              layout={layout}
              name={field.name}
              type="text"
              autoComplete="off"
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Field name="apiKey">
          {(field) => (
            <SecretField
              label={m.field_api_key()}
              layout={layout}
              description={current?.hasApiKey ? m.field_api_key_saved() : undefined}
              saved={current?.hasApiKey ?? false}
              onReveal={async () => (await revealFn({ data: { service } })).secret}
              name={field.name}
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
      </FieldGroup>
      {layout === "row" ? (
        <SettingsActions>{buttons}</SettingsActions>
      ) : (
        <div className="flex justify-end gap-2">{buttons}</div>
      )}
    </form>
  );
}
