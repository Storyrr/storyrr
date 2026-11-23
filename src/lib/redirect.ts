/**
 * Returns `target` if it is a same-origin path, else `/`. Guards the sign-in
 * `?redirect=` parameter against open redirects (`//evil.example`, `https://…`).
 */
export function safeRedirectPath(target: string | undefined): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return "/";
  }
  return target;
}
