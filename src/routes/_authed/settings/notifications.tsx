import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { SelectField } from "#/components/form/select-field";
import { TabNav } from "#/components/layout/tab-nav";
import { SettingsSection } from "#/components/settings/settings-section";
import { FieldGroup } from "#/components/ui/field";
import { saveNotificationGeneral } from "#/functions/notifications.functions";
import { AGENT_DEFINITIONS, NOTIFICATION_AGENTS } from "#/lib/notifications";
import { notificationKeys, notificationSettingsQuery } from "#/lib/queries/notifications";
import { m } from "#/paraglide/messages.js";
import { baseLocale, isLocale, locales, type Locale } from "#/paraglide/runtime.js";

export const Route = createFileRoute("/_authed/settings/notifications")({
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/+$/, "") === "/settings/notifications")
      throw redirect({ to: "/settings/notifications/$agent", params: { agent: "email" } });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(notificationSettingsQuery()),
  head: () => ({ meta: [{ title: `${m.settings_tab_notifications()} · ${m.app_name()}` }] }),
  component: NotificationsLayout,
});

const languageLabels: Record<Locale, () => string> = { en: m.language_en, fr: m.language_fr };
const TABS = NOTIFICATION_AGENTS.map((agent) => ({
  to: `/settings/notifications/${agent}`,
  label: AGENT_DEFINITIONS[agent].label,
}));

function NotificationsLayout() {
  const { data } = useSuspenseQuery(notificationSettingsQuery());
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveNotificationGeneral);
  const save = useMutation({
    mutationFn: (locale: Locale) => saveFn({ data: { locale } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
  return (
    <div className="flex flex-col gap-10">
      <SettingsSection
        title={m.notification_general_title()}
        description={m.notification_general_description()}
      >
        <FieldGroup>
          <SelectField
            label={m.notification_language()}
            layout="row"
            options={locales.map((locale) => ({ id: locale, label: languageLabels[locale]() }))}
            value={data.locale ?? baseLocale}
            onChange={(value) => {
              if (value && isLocale(value)) save.mutate(value);
            }}
            disabled={save.isPending}
          />
        </FieldGroup>
      </SettingsSection>
      <TabNav label={m.settings_tab_notifications()} tabs={TABS}>
        <Outlet />
      </TabNav>
    </div>
  );
}
