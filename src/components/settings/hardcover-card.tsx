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
import { saveHardcover, testHardcover } from "#/functions/settings.functions";
import { settingsKeys } from "#/lib/queries/settings";
import { HardcoverTokenFormSchema, type HardcoverTokenForm } from "#/lib/schemas/settings";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

type Feedback = { tone: "success" | "error"; message: string } | null;

/** Hardcover API token for eBook search: stored encrypted, never shown back. */
export function HardcoverCard({ hasToken }: { hasToken: boolean }) {
  const queryClient = useQueryClient();
  const testFn = useServerFn(testHardcover);
  const saveFn = useServerFn(saveHardcover);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const onError = (error: Error) =>
    setFeedback({ tone: "error", message: error.message || m.error_generic() });

  const test = useMutation({
    mutationFn: (data: HardcoverTokenForm) => testFn({ data }),
    onMutate: () => setFeedback(null),
    onSuccess: (result) =>
      setFeedback(
        result.ok
          ? { tone: "success", message: m.test_ok_hardcover() }
          : { tone: "error", message: serviceErrorMessage("hardcover", result.error) },
      ),
    onError,
  });
  const save = useMutation({
    mutationFn: (data: HardcoverTokenForm) => saveFn({ data }),
    onMutate: () => setFeedback(null),
    onSuccess: async () => {
      setFeedback({ tone: "success", message: m.action_saved() });
      await queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError,
  });
  const form = useForm({
    defaultValues: { token: "" },
    validators: { onSubmit: HardcoverTokenFormSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });

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
            <h2>{m.settings_hardcover_title()}</h2>
          </CardTitle>
          <CardDescription>{m.settings_hardcover_description()}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {feedback?.tone === "error" ? <FormError message={feedback.message} /> : null}
            {feedback?.tone === "success" ? <FormSuccess message={feedback.message} /> : null}
            <form.Field name="token">
              {(field) => (
                <TextField
                  label={m.field_token()}
                  description={hasToken ? m.field_token_saved() : undefined}
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
          <Button
            variant="outline"
            isDisabled={test.isPending}
            onPress={() => test.mutate(form.state.values)}
          >
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
