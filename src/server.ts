import handler from "@tanstack/react-start/server-entry";

import { paraglideMiddleware } from "./paraglide/server.js";
import { db } from "./server/db";
import { getAppUrl } from "./server/app-url";
import { secureCookiesOnHttps } from "./server/auth/origins";
import { startScheduler } from "./server/jobs";
import { installLogCapture } from "./server/logs";
import { applyProxy, getNetworkSettings } from "./server/network";
import { startNotifications } from "./server/notifications";
import { settings } from "./server/settings";

// Server logs are also kept in memory for Settings → Jobs & logs.
installLogCapture();
// Outbound calls go through the proxy from Settings → Network, if any.
void getNetworkSettings(settings).then(applyProxy);
// Background jobs (library sync, submissions, availability) run in-process.
startScheduler();
// Notifications follow request and issue changes.
startNotifications(async () => ({
  db,
  settings,
  fetch: (input, init) => fetch(input, init),
  appUrl: await getAppUrl(settings),
}));

/**
 * Custom server entry: Paraglide resolves the request's locale (cookie, then
 * the browser's Accept-Language, then the base locale) and keeps it in
 * AsyncLocalStorage, so `getLocale()` and `m.*()` are request-scoped during SSR.
 * Cookies are marked Secure on HTTPS requests only, so the same instance works
 * over http on the LAN and over https through a tunnel.
 */
export default {
  async fetch(req: Request): Promise<Response> {
    return secureCookiesOnHttps(req, await paraglideMiddleware(req, () => handler.fetch(req)));
  },
};
