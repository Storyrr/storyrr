import "@tanstack/react-start/server-only";
import * as v from "valibot";

/**
 * Outcome of a call to an external service. Clients never throw fetch errors
 * at callers: they return one of these, which the UI can explain.
 */
export type ServiceErrorKind =
  /** Network error, timeout, 5xx or 429: try again later. */
  | "retryable"
  /** 401/403: the API key is wrong or was rotated. */
  | "auth_failed"
  | "not_found"
  /** The service refused the request (4xx) or answered something unexpected. */
  | "rejected";

export type ServiceError = {
  kind: ServiceErrorKind;
  message: string;
  status?: number;
  /** For network failures: no answer within `timeoutSeconds`, or no connection at all. */
  network?: "timeout" | "unreachable";
  timeoutSeconds?: number;
};

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

export const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });
export const fail = (
  kind: ServiceErrorKind,
  message: string,
  status?: number,
): { ok: false; error: ServiceError } => ({ ok: false, error: { kind, message, status } });

export type FetchFn = typeof fetch;

export type RequestJsonOptions<TSchema extends v.GenericSchema> = {
  fetch: FetchFn;
  /** Used in messages, e.g. "Chaptarr". */
  service: string;
  url: string | URL;
  init?: RequestInit;
  schema: TSchema;
  timeoutMs?: number;
};

/**
 * Fetches JSON and validates it, mapping every failure to a ServiceError.
 * Messages never include the URL's query string or headers (they can carry keys).
 */
export async function requestJson<TSchema extends v.GenericSchema>({
  fetch,
  service,
  url,
  init,
  schema,
  timeoutMs = 10_000,
}: RequestJsonOptions<TSchema>): Promise<ServiceResult<v.InferOutput<TSchema>>> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const timeoutSeconds = Math.round(timeoutMs / 1000);
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        ok: false,
        error: {
          kind: "retryable",
          message: `${service} didn't answer within ${timeoutSeconds} s`,
          network: "timeout",
          timeoutSeconds,
        },
      };
    }
    return {
      ok: false,
      error: { kind: "retryable", message: `${service} is unreachable`, network: "unreachable" },
    };
  }

  if (!response.ok) {
    const detail = await upstreamMessage(response);
    const { status } = response;
    if (status === 401 || status === 403)
      return fail("auth_failed", `${service} rejected the API key`, status);
    if (status === 404) return fail("not_found", detail ?? `${service}: not found`, status);
    if (status === 429 || status >= 500) {
      return fail("retryable", detail ?? `${service} answered ${status}`, status);
    }
    return fail("rejected", detail ?? `${service} answered ${status}`, status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fail("rejected", `${service} sent a response that isn't JSON`, response.status);
  }
  const parsed = v.safeParse(schema, body);
  if (!parsed.success) {
    return fail(
      "rejected",
      `${service} sent an unexpected response: ${v.summarize(parsed.issues)}`,
    );
  }
  return ok(parsed.output);
}

const MessageBodySchema = v.union([
  v.object({ message: v.string() }),
  v.array(v.object({ errorMessage: v.string() })),
]);

/** Best-effort upstream error text (Servarr-style `message` or validation errors). */
async function upstreamMessage(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    const parsed = v.safeParse(MessageBodySchema, JSON.parse(text));
    if (parsed.success) {
      return Array.isArray(parsed.output)
        ? parsed.output.map((e) => e.errorMessage).join("; ")
        : parsed.output.message;
    }
    return text.trim().slice(0, 300) || undefined;
  } catch {
    return undefined;
  }
}
