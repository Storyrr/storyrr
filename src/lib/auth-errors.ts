/**
 * The error of a server function called without a session (signed out, or the
 * session ended). The browser then goes back to the sign-in page.
 */
export const UNAUTHORIZED = "Unauthorized";

/** Where to sign in again from this page, to come back to it afterwards. */
export function signInAgainUrl(location: { pathname: string; search: string }): string | null {
  // Already there (or not set up yet): nothing to leave.
  if (/^\/(sign-in|setup|forgot-password|reset-password)(\/|$)/.test(location.pathname))
    return null;
  const back = `${location.pathname}${location.search}`;
  return `/sign-in?redirect=${encodeURIComponent(back)}`;
}
