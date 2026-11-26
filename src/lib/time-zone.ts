import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/** Holds the browser's time zone, so the server renders dates as the browser will. */
export const TIME_ZONE_COOKIE = "storyrr-tz";

/** A time zone Intl accepts ("Europe/Paris"), else undefined. */
export function validTimeZone(value: string | undefined): string | undefined {
  if (!value || value.length > 64) return undefined;
  try {
    // Throws on a zone it doesn't know.
    const format = new Intl.DateTimeFormat("en", { timeZone: value });
    return format.resolvedOptions().timeZone ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The time zone to format dates in. On the server: the visitor's, from the
 * cookie their browser set on an earlier page (the server's own zone on a very
 * first visit). In the browser: undefined, i.e. the browser's own. Both sides
 * then print the same text, so hydration finds what it expects.
 */
export const displayTimeZone = createIsomorphicFn()
  .server(() => {
    try {
      return validTimeZone(getCookie(TIME_ZONE_COOKIE));
    } catch {
      // Outside a request (a job formatting a date): the server's own zone.
      return undefined;
    }
  })
  .client((): string | undefined => undefined);
