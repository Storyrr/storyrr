/**
 * better-auth's admin plugin also serves its endpoints over HTTP
 * (`/api/auth/admin/*`: set-role, ban-user, remove-user, impersonate-user…),
 * checking only that the caller's role is admin. Storyrr changes accounts
 * through its own server functions instead, which add its checks (the Owner is
 * changed by nobody else, no change to one's own account, permissions): those
 * routes would bypass them, so they're closed. Server code keeps calling
 * `auth.api.*` directly.
 */
const BLOCKED_PREFIXES = ["/admin"];

const AUTH_BASE_PATH = "/api/auth";

/** Whether a request to the better-auth handler targets a closed endpoint. */
export function isBlockedAuthPath(requestUrl: string): boolean {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    // Unparseable: better-auth would not route it either, refuse it here.
    return true;
  }
  const path = pathname
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
  const relative = path.startsWith(`${AUTH_BASE_PATH}/`) ? path.slice(AUTH_BASE_PATH.length) : path;
  return BLOCKED_PREFIXES.some(
    (prefix) => relative === prefix || relative.startsWith(`${prefix}/`),
  );
}
