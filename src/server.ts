import handler from "@tanstack/react-start/server-entry";

import { paraglideMiddleware } from "./paraglide/server.js";
import { db } from "./server/db";
import { getEnv } from "./server/env";
import { startScheduler } from "./server/jobs";
import { installLogCapture } from "./server/logs";
import { startNotifications } from "./server/notifications";
import { settings } from "./server/settings";

// Server logs are also kept in memory for Settings → Jobs & logs.
installLogCapture();
// Background jobs (library sync, submissions, availability) run in-process.
startScheduler();
// Notifications follow request and issue changes.
startNotifications(() => ({
  db,
  settings,
  fetch: (input, init) => fetch(input, init),
  appUrl: getEnv().BETTER_AUTH_URL.replace(/\/+$/, ""),
}));

/**
 * Custom server entry: Paraglide resolves the request's locale (cookie, then
 * the browser's Accept-Language, then the base locale) and keeps it in
 * AsyncLocalStorage, so `getLocale()` and `m.*()` are request-scoped during SSR.
 */
export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, () => handler.fetch(req));
  },
};
