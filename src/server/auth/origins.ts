/** A forwarded header's first value (proxies append theirs after a comma). */
const firstValue = (value: string | null) => value?.split(",")[0]?.trim() || null;

const HOST = /^[a-z0-9.-]+(:\d+)?$|^\[[0-9a-f:.]+\](:\d+)?$/i;

/**
 * The origin a request came to, as the browser saw it: the reverse proxy's
 * `X-Forwarded-Host` / `X-Forwarded-Proto` when present (a tunnel serves https
 * but talks http to Storyrr), else the request's own. Null if malformed.
 */
export function requestOrigin(request: Request): string | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  const host =
    firstValue(request.headers.get("x-forwarded-host")) ??
    firstValue(request.headers.get("host")) ??
    url.host;
  const proto = firstValue(request.headers.get("x-forwarded-proto")) ?? url.protocol.slice(0, -1);
  if (!HOST.test(host) || (proto !== "http" && proto !== "https")) return null;
  return `${proto}://${host.toLowerCase()}`;
}

/** Whether a request came over HTTPS (directly or through a proxy / tunnel). */
export const isHttpsRequest = (request: Request) =>
  requestOrigin(request)?.startsWith("https://") ?? false;

/** A link better-auth built from the request, moved to the application URL. */
export function linkOnAppUrl(url: string, appUrl: string): string {
  const link = new URL(url, appUrl);
  const base = new URL(appUrl);
  link.protocol = base.protocol;
  link.host = base.host;
  return link.toString();
}

/**
 * Adds `Secure` to the cookies of a response to an HTTPS request, so a session
 * cookie set through a tunnel never travels over plain http. Over http (the
 * LAN), cookies stay as they are, or the browser would drop them.
 */
export function secureCookiesOnHttps(request: Request, response: Response): Response {
  if (!isHttpsRequest(request)) return response;
  const cookies = response.headers.getSetCookie();
  if (cookies.every((c) => /;\s*secure\s*(;|$)/i.test(c))) return response;
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of cookies) {
    headers.append("set-cookie", /;\s*secure\s*(;|$)/i.test(cookie) ? cookie : `${cookie}; Secure`);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
