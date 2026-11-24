import { describe, expect, it } from "vitest";

import { DEFAULT_WEBHOOK_TEMPLATE, renderTemplate } from "./notifications";

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
