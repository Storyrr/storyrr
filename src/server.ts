import handler from "@tanstack/react-start/server-entry";

import { paraglideMiddleware } from "./paraglide/server.js";
import { db } from "./server/db";
import { getAppUrl } from "./server/app-url";
import { withClientIp } from "./server/auth/client-ip";
import { secureCookiesOnHttps } from "./server/auth/origins";
import { startScheduler, stopScheduler } from "./server/jobs";
import { installLogCapture } from "./server/logs";
import { applyProxy, getNetworkSettings, trustsProxy } from "./server/network";
import { startNotifications } from "./server/notifications";
import { settings } from "./server/settings";

// Server logs are also kept in memory for Settings → Jobs & logs.
installLogCapture();
// Outbound calls go through the proxy from Settings → Network, if any.
void getNetworkSettings(settings)
  .then(applyProxy)
  .catch((error: unknown) => console.error("Could not apply the proxy settings:", error));
// Background jobs (library sync, submissions, availability) run in-process.
startScheduler();
// Notifications follow request and issue changes.
startNotifications(async () => ({
  db,
  settings,
  fetch: (input, init) => fetch(input, init),
  appUrl: await getAppUrl(settings),
}));

declare global {
  // Survives dev HMR re-evaluating this module, so the handlers are added once per process.
  var storyrrShutdown: boolean | undefined;
}
if (!globalThis.storyrrShutdown) {
  globalThis.storyrrShutdown = true;
  // `docker stop`: Nitro closes the HTTP server; the jobs' timers would keep the
  // process alive until Docker kills it, so stop them too.
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, stopScheduler);
  // Close the database cleanly (checkpoints the write-ahead log).
  process.once("exit", () => db.$client.close());
}

/**
 * Custom server entry: Paraglide resolves the request's locale (cookie, then
 * the browser's Accept-Language, then the base locale) and keeps it in
 * AsyncLocalStorage, so `getLocale()` and `m.*()` are request-scoped during SSR.
 * Cookies are marked Secure on HTTPS requests only, so the same instance works
 * over http on the LAN and over https through a tunnel.
 */
export default {
  async fetch(req: Request): Promise<Response> {
    // The server's requests carry the connection's address (srvx's `ip`).
    const connectionIp = "ip" in req && typeof req.ip === "string" ? req.ip : undefined;
    withClientIp(req, connectionIp, trustsProxy());
    return secureCookiesOnHttps(req, await paraglideMiddleware(req, () => handler.fetch(req)));
  },
};
