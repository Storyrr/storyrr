import handler from "@tanstack/react-start/server-entry";

import { paraglideMiddleware } from "./paraglide/server.js";
import { startScheduler } from "./server/jobs";

// Background jobs (library sync, submissions, availability) run in-process.
startScheduler();

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
