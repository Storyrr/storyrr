import { describe, expect, it } from "vitest";

import { CLIENT_IP_HEADER, withClientIp } from "./client-ip";

const request = (headers: Record<string, string>) => new Request("http://storyrr/", { headers });

describe("withClientIp", () => {
  it("uses the connection's address and ignores what the visitor sent", () => {
    const stamped = withClientIp(
      request({ "x-forwarded-for": "1.2.3.4", [CLIENT_IP_HEADER]: "5.6.7.8" }),
      "192.168.1.10",
      false,
    );
    expect(stamped.headers.get(CLIENT_IP_HEADER)).toBe("192.168.1.10");
  });

  it("behind a trusted proxy, takes the address that proxy added", () => {
    const stamped = withClientIp(
      request({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }),
      "172.18.0.2",
      true,
    );
    expect(stamped.headers.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
  });

  it("falls back to the connection when the proxy sent no address", () => {
    expect(withClientIp(request({}), "172.18.0.2", true).headers.get(CLIENT_IP_HEADER)).toBe(
      "172.18.0.2",
    );
  });

  it("removes a forged header when no address is known", () => {
    const stamped = withClientIp(request({ [CLIENT_IP_HEADER]: "5.6.7.8" }), undefined, false);
    expect(stamped.headers.has(CLIENT_IP_HEADER)).toBe(false);
  });
});
