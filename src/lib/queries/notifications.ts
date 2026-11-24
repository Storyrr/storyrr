import { queryOptions } from "@tanstack/react-query";

import { getMyNotifications, getNotificationSettings } from "#/functions/notifications.functions";

export const notificationKeys = {
  all: ["notifications"] as const,
  settings: () => [...notificationKeys.all, "settings"] as const,
  mine: () => [...notificationKeys.all, "mine"] as const,
};

export const notificationSettingsQuery = () =>
  queryOptions({ queryKey: notificationKeys.settings(), queryFn: () => getNotificationSettings() });

export const myNotificationsQuery = () =>
  queryOptions({ queryKey: notificationKeys.mine(), queryFn: () => getMyNotifications() });
