import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FormError } from "#/components/form/form-error";
import { SecretField } from "#/components/form/secret-field";
import { Button, LinkButton } from "#/components/ui/button";
import { SettingsActions } from "#/components/settings/settings-section";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { revealSecret, saveHardcover, testHardcover } from "#/functions/settings.functions";
import { settingsKeys } from "#/lib/queries/settings";
import { HardcoverTokenFormSchema, type HardcoverTokenForm } from "#/lib/schemas/settings";
import { serviceErrorMessage } from "#/lib/service-errors";
import { m } from "#/paraglide/messages.js";

/** Hardcover's new-token page, with the one permission Storyrr needs pre-checked (from Hardcover's docs). */
const NEW_TOKEN_URL = "https://hardcover.app/account/api/keys/new?scope=read%3Acatalog%3Asearch";

type Feedback = { tone: "success" | "error"; message: string } | null;

/** Hardcover API token for eBook search: stored encrypted, never shown back. */
export function HardcoverForm({ hasToken }: { hasToken: boolean }) {
  const queryClient = useQueryClient();
  const testFn = useServerFn(testHardcover);
  const saveFn = useServerFn(saveHardcover);
  const revealFn = useServerFn(revealSecret);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const onError = (error: Error) =>
    setFeedback({ tone: "error", message: error.message || m.error_generic() });

  const test = useMutation({
    mutationFn: (data: HardcoverTokenForm) => testFn({ data }),
    onMutate: () => setFeedback(null),
    onSuccess: (result) =>
      result.ok
        ? toast.success(m.test_ok_hardcover())
        : setFeedback({ tone: "error", message: serviceErrorMessage("hardcover", result.error) }),
    onError,
  });
  const save = useMutation({
    mutationFn: (data: HardcoverTokenForm) => saveFn({ data }),
    onMutate: () => setFeedback(null),
    onSuccess: async () => {
      toast.success(m.action_saved());
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
        <form.Field name="token">
          {(field) => (
            <SecretField
              label={m.settings_hardcover_title()}
              layout="row"
              description={
                hasToken
                  ? `${m.settings_hardcover_description()} ${m.field_token_saved()}`
                  : m.settings_hardcover_description()
              }
              saved={hasToken}
              onReveal={async () => (await revealFn({ data: { service: "hardcover" } })).secret}
              name={field.name}
              value={field.state.value}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
      </FieldGroup>
      <SettingsActions>
        <LinkButton variant="outline" href={NEW_TOKEN_URL} target="_blank" rel="noreferrer">
          {m.settings_hardcover_create_token()}
          <ExternalLinkIcon data-icon="inline-end" />
        </LinkButton>
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
      </SettingsActions>
    </form>
  );
}
