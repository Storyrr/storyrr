import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { toast } from "sonner";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { saveMyNotificationChannel } from "#/functions/notifications.functions";
import {
  ADMIN_BACKED_CHANNELS,
  AGENT_DEFINITIONS,
  PERSONAL_CHANNELS,
  PERSONAL_EVENTS,
  UserNotificationChannelSchema,
  type NotificationEvent,
  type PersonalChannel,
  type UserNotificationChannel,
  type UserNotifications,
} from "#/lib/notifications";
import { can } from "#/lib/permissions";
import { myNotificationsQuery, notificationKeys } from "#/lib/queries/notifications";
import { m } from "#/paraglide/messages.js";

type TextSpec = { name: string; label: string; description?: string; secret?: boolean };

/** The text fields of each channel's tab. */
function textFields(channel: PersonalChannel, adminPushover: boolean): TextSpec[] {
  switch (channel) {
    case "discord":
      return [
        {
          name: "discordId",
          label: m.my_notifications_discord(),
          description: m.my_notifications_discord_description(),
        },
      ];
    case "telegram":
      return [
        {
          name: "chatId",
          label: m.my_notifications_telegram(),
          description: m.my_notifications_telegram_description(),
        },
      ];
    case "pushbullet":
      return [
        {
          name: "accessToken",
          label: m.my_notifications_pushbullet(),
          description: m.my_notifications_pushbullet_description(),
          secret: true,
        },
      ];
    case "pushover":
      return [
        {
          name: "appToken",
          label: m.my_notifications_pushover_app_token(),
          description: adminPushover
            ? m.my_notifications_pushover_app_token_optional()
            : m.my_notifications_pushover_app_token_description(),
          secret: true,
        },
        {
          name: "userKey",
          label: m.my_notifications_pushover(),
          description: m.my_notifications_pushover_description(),
          secret: true,
        },
      ];
    default:
      return [];
  }
}

/** The channel's text values, as edited in its form. */
function textValues(channel: PersonalChannel, prefs: UserNotifications): Record<string, string> {
  switch (channel) {
    case "discord":
      return { discordId: prefs.discord.discordId };
    case "telegram":
      return { chatId: prefs.telegram.chatId };
    case "pushbullet":
      return { accessToken: prefs.pushbullet.accessToken };
    case "pushover":
      return { appToken: prefs.pushover.appToken, userKey: prefs.pushover.userKey };
    default:
      return {};
  }
}

/** What a tab saves: its channel with the form's values. */
function toInput(
  channel: PersonalChannel,
  text: Record<string, string>,
  events: NotificationEvent[],
): UserNotificationChannel {
  const t = (name: string) => text[name] ?? "";
  switch (channel) {
    case "email":
      return { channel, value: { events } };
    case "webpush":
      return { channel, value: { events } };
    case "discord":
      return { channel, value: { discordId: t("discordId"), events } };
    case "telegram":
      return { channel, value: { chatId: t("chatId"), events } };
    case "pushbullet":
      return { channel, value: { accessToken: t("accessToken"), events } };
    default:
      return { channel, value: { appToken: t("appToken"), userKey: t("userKey"), events } };
  }
}

/**
 * Profile → Settings → Notifications, like Seerr: one tab per channel, each with
 * its own events. Email, Web Push, Discord and Telegram appear once an
 * administrator enables them; Pushbullet and Pushover work with one's own tokens.
 */
export function NotificationSettings() {
  const { user } = useRouteContext({ from: "/_authed" });
  const { data } = useSuspenseQuery(myNotificationsQuery());
  const enabled = (agent: string) => data.enabledAgents.some((a) => a === agent);
  const channels = PERSONAL_CHANNELS.filter(
    (channel) => !ADMIN_BACKED_CHANNELS.includes(channel) || enabled(channel),
  );
  // Only events this account can get: its own requests and issues, and what it manages.
  const events: NotificationEvent[] = [
    ...(can(user, "manage_requests")
      ? (["request_pending", "request_auto_approved"] as const)
      : []),
    ...PERSONAL_EVENTS,
    ...(can(user, "manage_issues") ? (["issue_created"] as const) : []),
  ];

  return (
    <SettingsSection
      title={m.settings_tab_notifications()}
      description={m.my_notifications_description()}
    >
      <Tabs defaultSelectedKey={channels[0]} className="flex flex-col gap-6">
        <TabsList aria-label={m.settings_tab_notifications()} className="flex-wrap">
          {channels.map((channel) => (
            <TabsTrigger key={channel} id={channel}>
              {AGENT_DEFINITIONS[channel].label()}
            </TabsTrigger>
          ))}
        </TabsList>
        {channels.map((channel) => (
          <TabsContent key={channel} id={channel}>
            <ChannelForm
              channel={channel}
              prefs={data.prefs}
              events={events}
              email={user.email}
              adminPushover={enabled("pushover")}
            />
          </TabsContent>
        ))}
      </Tabs>
    </SettingsSection>
  );
}

function ChannelForm({
  channel,
  prefs,
  events,
  email,
  adminPushover,
}: {
  channel: PersonalChannel;
  prefs: UserNotifications;
  events: readonly NotificationEvent[];
  email: string;
  adminPushover: boolean;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveMyNotificationChannel);
  const save = useMutation({
    mutationFn: (input: UserNotificationChannel) => saveFn({ data: input }),
    onSuccess: (result) => {
      if (result.ok) toast.success(m.action_saved());
      return queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
  const specs = textFields(channel, adminPushover);
  const form = useForm({
    defaultValues: { text: textValues(channel, prefs), events: prefs[channel].events },
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(
          UserNotificationChannelSchema,
          toInput(channel, value.text, value.events),
        );
        if (result.success) return undefined;
        const fields: Record<string, string> = {};
        for (const issue of result.issues) {
          const key = issue.path?.[1]?.key;
          if (typeof key === "string") fields[`text.${key}`] ??= issue.message;
        }
        return { fields };
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const result = await save
        .mutateAsync(toInput(channel, value.text, value.events))
        .catch(() => null);
      // Server-side check (Pushover needs an application): shown on its field.
      if (result && !result.ok)
        formApi.setFieldMeta(`text.${result.field}`, (meta) => ({
          ...meta,
          errorMap: { ...meta.errorMap, onSubmit: result.message },
        }));
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
        {channel === "email" ? (
          <SettingsRow label={m.field_email()}>
            <p className="text-sm">{email}</p>
          </SettingsRow>
        ) : null}
        {channel === "webpush" ? (
          <SettingsRow
            label={m.my_notifications_webpush()}
            description={m.my_notifications_webpush_description()}
          >
            <PushDeviceToggle />
          </SettingsRow>
        ) : null}
        {specs.map((spec) => (
          <form.Field key={spec.name} name={`text.${spec.name}`}>
            {(field) => (
              <TextField
                label={spec.label}
                layout="row"
                description={spec.description}
                name={field.name}
                type={spec.secret ? "password" : "text"}
                autoComplete="off"
                value={field.state.value ?? ""}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors.map((message) => ({
                  message: typeof message === "string" ? message : undefined,
                }))}
              />
            )}
          </form.Field>
        ))}
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
              {m.action_save()}
            </Button>
          )}
        </form.Subscribe>
      </SettingsActions>
    </form>
  );
}
