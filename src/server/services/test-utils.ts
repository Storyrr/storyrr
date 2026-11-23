import type { FetchFn } from "./result";

/** A fake `fetch` answering from a handler, recording the requests it got. */
export function fakeFetch(
  handler: (url: URL, init: RequestInit | undefined) => Response | Promise<Response>,
) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const fetch: FetchFn = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetch, calls };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });
