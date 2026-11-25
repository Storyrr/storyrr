import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import settings from "../../project.inlang/settings.json" with { type: "json" };

/** Every locale's catalog has the source's keys, and each message the same placeholders. */
const read = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../messages/${locale}.json`), "utf8"));

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).toSorted();

const source = read(settings.baseLocale);

describe.each(settings.locales.filter((locale) => locale !== settings.baseLocale))(
  "messages/%s.json",
  (locale) => {
    const catalog = read(locale);

    it("has exactly the source's keys", () => {
      expect(Object.keys(catalog).toSorted()).toEqual(Object.keys(source).toSorted());
    });

    it("keeps each message's placeholders", () => {
      const mismatched = Object.keys(source).filter(
        (key) =>
          key in catalog &&
          JSON.stringify(placeholders(source[key] ?? "")) !==
            JSON.stringify(placeholders(catalog[key] ?? "")),
      );
      expect(mismatched).toEqual([]);
    });
  },
);
