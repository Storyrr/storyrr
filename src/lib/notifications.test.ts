import { describe, expect, it } from "vitest";

import { DEFAULT_WEBHOOK_TEMPLATE, isPushServiceEndpoint, renderTemplate } from "./notifications";

describe("renderTemplate", () => {
  it("fills variables with JSON-escaped values and keeps the JSON valid", () => {
    const body = renderTemplate(DEFAULT_WEBHOOK_TEMPLATE, {
      subject: 'Now available: "Dune"',
      media_title: "Dune\nPart 1",
    });
    expect(JSON.parse(body)).toMatchObject({
      subject: 'Now available: "Dune"',
      media: { title: "Dune\nPart 1" },
    });
  });
});

describe("isPushServiceEndpoint", () => {
  it("accepts the browsers' push services only, over HTTPS", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isPushServiceEndpoint(ok), ok).toBe(true);
    }
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user:pw@fcm.googleapis.com/x",
      "https://evilfcm.googleapis.com.attacker.test/x",
      "https://notgoogleapis.com/x",
      "https://chaptarr:8789/api/v1/system/status",
      "https://169.254.169.254/latest/meta-data",
      "not a url",
    ]) {
      expect(isPushServiceEndpoint(bad), bad).toBe(false);
    }
  });
});
