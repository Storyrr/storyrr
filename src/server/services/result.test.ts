import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { serviceErrorMessage } from "#/lib/service-errors";

import { requestJson } from "./result";

const call = (fetch: typeof globalThis.fetch, timeoutMs = 50) =>
  requestJson({
    fetch,
    service: "Chaptarr",
    url: "http://chaptarr/x",
    schema: v.unknown(),
    timeoutMs,
  });

const hang: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
const refused: typeof fetch = () => Promise.reject(new TypeError("fetch failed"));

describe("requestJson network failures", () => {
  it("reports a timeout with its duration", async () => {
    const result = await call(hang, 1000);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "retryable", network: "timeout", timeoutSeconds: 1 },
    });
    if (!result.ok)
      expect(serviceErrorMessage("chaptarr", result.error)).toMatch(
        /didn't answer within 1 seconds/,
      );
  });

  it("reports a refused connection as unreachable", async () => {
    const result = await call(refused);
    expect(result).toMatchObject({ ok: false, error: { network: "unreachable" } });
    if (!result.ok)
      expect(serviceErrorMessage("chaptarr", result.error)).toMatch(/Couldn't connect to Chaptarr/);
  });
});
