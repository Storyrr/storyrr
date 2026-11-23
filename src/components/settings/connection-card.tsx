import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
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
import { Spinner } from "#/components/ui/spinner";
import { saveServiceConnection, testServiceConnection } from "#/functions/settings.functions";
import { settingsKeys } from "#/lib/queries/settings";
import {
  ConnectionFormSchema,
  type ConnectionForm,
  type ServiceName,
} from "#/lib/schemas/settings";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

const copy: Record<ServiceName, { title: () => string; description: () => string }> = {
  chaptarr: { title: m.service_chaptarr, description: m.service_chaptarr_description },
  audiobookshelf: {
    title: m.service_audiobookshelf,
    description: m.service_audiobookshelf_description,
  },
};

type Feedback = { tone: "success" | "error"; message: string } | null;

export function ConnectionCard({
  service,
  current,
}: {
  service: ServiceName;
  current: { url: string; hasApiKey: boolean } | null;
}) {
  const queryClient = useQueryClient();
  const testFn = useServerFn(testServiceConnection);
  const saveFn = useServerFn(saveServiceConnection);
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
            ? m.test_ok_chaptarr({ version: result.version ?? "" })
            : m.test_ok_audiobookshelf({ count: result.libraries ?? 0 }),
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

  return (
    <Card>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-6"
      >
        <CardHeader>
          <CardTitle>
            <h2>{copy[service].title()}</h2>
          </CardTitle>
          <CardDescription>{copy[service].description()}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {feedback?.tone === "error" ? <FormError message={feedback.message} /> : null}
            {feedback?.tone === "success" ? <FormSuccess message={feedback.message} /> : null}
            <form.Field name="url">
              {(field) => (
                <TextField
                  label={m.field_url()}
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
                <TextField
                  label={m.field_api_key()}
                  description={current?.hasApiKey ? m.field_api_key_saved() : undefined}
                  name={field.name}
                  type="password"
                  autoComplete="off"
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" isDisabled={test.isPending} onPress={() => void runTest()}>
            {test.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.action_test()}
          </Button>
          <Button type="submit" isDisabled={save.isPending}>
            {save.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.action_save()}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
