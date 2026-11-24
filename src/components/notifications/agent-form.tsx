import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState } from "react";
import * as v from "valibot";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { SecretField } from "#/components/form/secret-field";
import { TextField } from "#/components/form/text-field";
import {
  SETTINGS_ROW,
  SettingsActions,
  SettingsRow,
  SettingsSection,
} from "#/components/settings/settings-section";
import { Button } from "#/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import {
  revealAgentSecret,
  saveNotificationAgent,
  testNotificationAgent,
} from "#/functions/notifications.functions";
import {
  AGENT_DEFINITIONS,
  DEFAULT_WEBHOOK_TEMPLATE,
  NOTIFICATION_EVENTS,
  type AgentField,
  type NotificationAgent,
  type NotificationEvent,
} from "#/lib/notifications";
import { notificationKeys } from "#/lib/queries/notifications";
import { cn } from "#/lib/utils";
import { m } from "#/paraglide/messages.js";

import { EventChecklist } from "./event-checklist";

type Values = Record<string, string | boolean>;
export type StoredAgent = {
  enabled: boolean;
  events: NotificationEvent[];
  config: Record<string, string | number | boolean>;
  saved: string[];
};

const DEFAULTS: Partial<Record<NotificationAgent, Values>> = {
  email: { port: "587" },
  gotify: { priority: "5" },
  webhook: { template: DEFAULT_WEBHOOK_TEMPLATE },
};

function initialValues(agent: NotificationAgent, stored: StoredAgent | null): Values {
  const values: Values = {};
  for (const field of AGENT_DEFINITIONS[agent].fields as readonly AgentField[]) {
    const current = stored?.config[field.name] ?? DEFAULTS[agent]?.[field.name];
    values[field.name] =
      field.kind === "switch" ? current === true : current === undefined ? "" : String(current);
  }
  return values;
}

/** Form strings back to the agent's types (numbers); blank saved secrets stay blank (kept server-side). */
function toConfig(agent: NotificationAgent, values: Values) {
  const config: Record<string, string | number | boolean> = {};
  for (const field of AGENT_DEFINITIONS[agent].fields as readonly AgentField[]) {
    const value = values[field.name];
    config[field.name] =
      field.kind === "number" && typeof value === "string" && value !== ""
        ? Number(value)
        : (value ?? "");
  }
  return config;
}

/** Field errors from the agent's schema, keyed like the form fields. */
function validate(agent: NotificationAgent, values: Values, saved: readonly string[]) {
  const config = toConfig(agent, values);
  // A saved secret left blank is kept: validate as if present.
  for (const name of saved) if (!config[name]) config[name] = "saved";
  for (const field of AGENT_DEFINITIONS[agent].fields as readonly AgentField[])
    if (field.kind === "number" && config[field.name] === "") delete config[field.name];
  const result = v.safeParse(AGENT_DEFINITIONS[agent].schema, config);
  if (result.success) return undefined;
  const fields: Record<string, string> = {};
  for (const issue of result.issues) {
    const key = issue.path?.[0]?.key;
    if (typeof key === "string") fields[`config.${key}`] ??= issue.message;
  }
  return { fields };
}

/** Settings of one notification agent: on/off, events, its fields, Test and Save. */
export function AgentForm({
  agent,
  stored,
}: {
  agent: NotificationAgent;
  stored: StoredAgent | null;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveNotificationAgent);
  const testFn = useServerFn(testNotificationAgent);
  const revealFn = useServerFn(revealAgentSecret);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(
    null,
  );
  const definition = AGENT_DEFINITIONS[agent];
  const saved = stored?.saved ?? [];

  const save = useMutation({
    mutationFn: (value: { enabled: boolean; events: NotificationEvent[]; config: Values }) =>
      saveFn({
        data: {
          agent,
          enabled: value.enabled,
          events: value.events,
          config: toConfig(agent, value.config),
        },
      }),
    onMutate: () => setFeedback(null),
    onSuccess: async () => {
      setFeedback({ tone: "success", message: m.action_saved() });
      await queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
    onError: (error) => setFeedback({ tone: "error", message: error.message || m.error_generic() }),
  });
  const test = useMutation({
    mutationFn: (config: Values) => testFn({ data: { agent, config: toConfig(agent, config) } }),
    onMutate: () => setFeedback(null),
    onSuccess: (result) =>
      setFeedback(
        result.ok
          ? { tone: "success", message: m.notification_test_sent() }
          : { tone: "error", message: result.error },
      ),
    onError: (error) => setFeedback({ tone: "error", message: error.message || m.error_generic() }),
  });

  const form = useForm({
    defaultValues: {
      enabled: stored?.enabled ?? false,
      events: stored?.events ?? [...NOTIFICATION_EVENTS],
      config: initialValues(agent, stored),
    },
    validators: { onSubmit: ({ value }) => validate(agent, value.config, saved) },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });

  const runTest = async () => {
    await form.validate("submit");
    if (!form.state.isValid) return;
    test.mutate(form.state.values.config);
  };

  return (
    <SettingsSection title={definition.label()}>
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
          <form.Field name="enabled">
            {(field) => (
              <SettingsRow label={m.notification_enable_agent()}>
                <Switch
                  aria-label={m.notification_enable_agent()}
                  isSelected={field.state.value}
                  onChange={field.handleChange}
                />
              </SettingsRow>
            )}
          </form.Field>
          {(definition.fields as readonly AgentField[]).map((spec) => (
            <form.Field key={spec.name} name={`config.${spec.name}`}>
              {(field) => {
                const value = field.state.value;
                const errors = field.state.meta.errors.map((message) => ({
                  message: typeof message === "string" ? message : undefined,
                }));
                const label = spec.required ? `${spec.label()} *` : spec.label();
                if (spec.kind === "switch") {
                  return (
                    <SettingsRow label={label} description={spec.description?.()}>
                      <Switch
                        aria-label={spec.label()}
                        isSelected={value === true}
                        onChange={(on) => field.handleChange(on)}
                      />
                    </SettingsRow>
                  );
                }
                const text = typeof value === "string" ? value : "";
                if (spec.kind === "secret") {
                  return (
                    <SecretField
                      label={label}
                      layout="row"
                      description={spec.description?.()}
                      saved={saved.includes(spec.name)}
                      name={field.name}
                      value={text}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      errors={errors}
                      onReveal={async () =>
                        (await revealFn({ data: { agent, field: spec.name } })).secret
                      }
                    />
                  );
                }
                if (spec.kind === "textarea") {
                  return (
                    <TemplateField
                      label={label}
                      description={spec.description?.()}
                      value={text}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      errors={errors}
                    />
                  );
                }
                return (
                  <TextField
                    label={label}
                    layout="row"
                    description={spec.description?.()}
                    name={field.name}
                    value={text}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    errors={errors}
                  />
                );
              }}
            </form.Field>
          ))}
          <form.Field name="events">
            {(field) => (
              <SettingsRow
                label={m.notification_events()}
                description={m.notification_events_description()}
              >
                <EventChecklist
                  label={m.notification_events()}
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              </SettingsRow>
            )}
          </form.Field>
        </FieldGroup>
        <SettingsActions>
          <Button variant="outline" isDisabled={test.isPending} onPress={() => void runTest()}>
            {test.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.action_test()}
          </Button>
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

function TemplateField({
  label,
  description,
  value,
  onChange,
  onBlur,
  errors,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  errors: { message?: string }[];
}) {
  const id = useId();
  return (
    <Field data-invalid={errors.length > 0 || undefined} className={cn(SETTINGS_ROW)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        rows={14}
        spellCheck={false}
        className="font-mono text-xs"
        aria-invalid={errors.length > 0 || undefined}
      />
      {description ? (
        <FieldDescription className="md:col-start-2">{description}</FieldDescription>
      ) : null}
      <FieldError errors={errors} className="md:col-start-2" />
    </Field>
  );
}
