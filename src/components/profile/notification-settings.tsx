import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { FormError } from "#/components/form/form-error";
import { TextField } from "#/components/form/text-field";
import { EventChecklist } from "#/components/notifications/event-checklist";
import { PushDeviceToggle } from "#/components/pwa/push-device-toggle";
import {
  SettingsActions,
  SettingsRow,
  SettingsSection,
} from "#/components/settings/settings-section";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { saveMyNotifications } from "#/functions/notifications.functions";
import {
  PERSONAL_EVENTS,
  UserNotificationsSchema,
  type NotificationEvent,
  type UserNotifications,
} from "#/lib/notifications";
import { can } from "#/lib/permissions";
import { myNotificationsQuery, notificationKeys } from "#/lib/queries/notifications";
import { m } from "#/paraglide/messages.js";

/** Profile → Settings → Notifications: personal channels and events. */
export function NotificationSettings() {
  const { user } = useRouteContext({ from: "/_authed" });
  const { data } = useSuspenseQuery(myNotificationsQuery());
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveMyNotifications);
  const save = useMutation({
    mutationFn: (value: UserNotifications) => saveFn({ data: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
  const form = useForm({
    defaultValues: data.prefs,
    validators: { onSubmit: UserNotificationsSchema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value).catch(() => undefined);
    },
  });
  const enabled = (agent: string) => data.enabledAgents.some((a) => a === agent);
  // Only events this account can get: its own requests and issues, and what it manages.
  const events: NotificationEvent[] = [
    ...(can(user, "manage_requests")
      ? (["request_pending", "request_auto_approved"] as const)
      : []),
    ...PERSONAL_EVENTS,
    ...(can(user, "manage_issues") ? (["issue_created"] as const) : []),
  ];
  const personal = [
    {
      agent: "discord",
      name: "discordId",
      label: m.my_notifications_discord(),
      description: m.my_notifications_discord_description(),
      secret: false,
    },
    {
      agent: "telegram",
      name: "telegramChatId",
      label: m.my_notifications_telegram(),
      description: m.my_notifications_telegram_description(),
      secret: false,
    },
    {
      agent: "pushover",
      name: "pushoverUserKey",
      label: m.my_notifications_pushover(),
      description: m.my_notifications_pushover_description(),
      secret: true,
    },
    {
      agent: "pushbullet",
      name: "pushbulletToken",
      label: m.my_notifications_pushbullet(),
      description: m.my_notifications_pushbullet_description(),
      secret: true,
    },
  ] as const;

  return (
    <SettingsSection
      title={m.settings_tab_notifications()}
      description={
        data.enabledAgents.length > 0 ? m.my_notifications_description() : m.my_notifications_none()
      }
    >
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
          {enabled("email") ? (
            <form.Field name="email">
              {(field) => (
                <SettingsRow label={m.my_notifications_email()} description={user.email}>
                  <Switch
                    aria-label={m.my_notifications_email()}
                    isSelected={field.state.value}
                    onChange={field.handleChange}
                  />
                </SettingsRow>
              )}
            </form.Field>
          ) : null}
          {personal
            .filter((spec) => enabled(spec.agent))
            .map((spec) => (
              <form.Field key={spec.name} name={spec.name}>
                {(field) => (
                  <TextField
                    label={spec.label}
                    layout="row"
                    description={spec.description}
                    name={field.name}
                    type={spec.secret ? "password" : "text"}
                    autoComplete="off"
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    errors={field.state.meta.errors}
                  />
                )}
              </form.Field>
            ))}
          {enabled("webpush") ? (
            <>
              <form.Field name="webpush">
                {(field) => (
                  <SettingsRow
                    label={m.my_notifications_webpush()}
                    description={m.my_notifications_webpush_description()}
                  >
                    <Switch
                      aria-label={m.my_notifications_webpush()}
                      isSelected={field.state.value}
                      onChange={field.handleChange}
                    />
                  </SettingsRow>
                )}
              </form.Field>
              <PushDeviceToggle />
            </>
          ) : null}
          <form.Field name="events">
            {(field) => (
              <SettingsRow label={m.notification_events()}>
                <EventChecklist
                  label={m.notification_events()}
                  value={field.state.value}
                  onChange={field.handleChange}
                  events={events}
                />
              </SettingsRow>
            )}
          </form.Field>
        </FieldGroup>
        <SettingsActions>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" isDisabled={isSubmitting}>
                {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                {save.isSuccess ? m.action_saved() : m.action_save()}
              </Button>
            )}
          </form.Subscribe>
        </SettingsActions>
      </form>
    </SettingsSection>
  );
}
