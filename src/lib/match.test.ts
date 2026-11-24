import { describe, expect, it } from "vitest";

import { feedKey, titleKey } from "./match";

describe("titleKey", () => {
  it.each([
    ["Le Petit Prince!", "le petit prince"],
    ["L'Étranger", "l etranger"],
    ["Pride & Prejudice", "pride and prejudice"],
    ["  Dune:   Messiah ", "dune messiah"],
    ["ワンピース", "ワンピース"],
  ])("%s → %s", (title, key) => {
    expect(titleKey(title)).toBe(key);
  });
});

describe("feedKey", () => {
  it("ignores scheme, host case, www and a trailing slash", () => {
    const key = feedKey("https://feeds.example.com/show.xml");
    expect(feedKey("http://Feeds.Example.com/show.xml/")).toBe(key);
    expect(feedKey(" https://www.feeds.example.com/show.xml ")).toBe(key);
    expect(feedKey("https://feeds.example.com/show.xml?format=rss")).not.toBe(key);
  });
});
