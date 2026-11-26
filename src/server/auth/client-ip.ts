/**
 * The header better-auth reads the visitor's address from, for its sign-in rate
 * limits. Storyrr sets it itself on every request: a visitor can't choose it.
 */
export const CLIENT_IP_HEADER = "x-storyrr-client-ip";

/**
 * The visitor's address: the connection's own, or, when Storyrr is told it sits
 * behind a reverse proxy, the last address of X-Forwarded-For (the one that
 * proxy added; earlier ones come from the visitor and can be made up).
 */
export function clientIp(
  headers: Headers,
  connectionIp: string | undefined,
  trustProxy: boolean,
): string | undefined {
  if (trustProxy) {
    const forwarded = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (forwarded) return forwarded;
  }
  return connectionIp;
}

/** Stamps the request with the visitor's address, dropping any value the visitor sent. */
export function withClientIp(
  request: Request,
  connectionIp: string | undefined,
  trustProxy: boolean,
): Request {
  const ip = clientIp(request.headers, connectionIp, trustProxy);
  if (ip) request.headers.set(CLIENT_IP_HEADER, ip);
  else request.headers.delete(CLIENT_IP_HEADER);
  return request;
}
