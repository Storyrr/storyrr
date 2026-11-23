import { describe, expect, it } from "vitest";

import { titleKey } from "#/lib/match";
import { createDatabase } from "#/server/db/client";
import { createKavitaClient } from "#/server/services/kavita/client";
import { fakeFetch, json } from "#/server/services/test-utils";

import { ownedTitles, syncKavita } from "./index";

describe("Kavita library index", () => {
  it("indexes every name of every series and matches titles loosely", async () => {
    const db = createDatabase(":memory:");
    const { fetch } = fakeFetch((url) =>
      url.pathname === "/api/Plugin/authenticate"
        ? json({ token: "jwt" })
        : json([
            { id: 1, name: "L'Étranger", localizedName: null, originalName: null, libraryId: 1 },
            {
              id: 2,
              name: "Berserk",
              localizedName: "ベルセルク",
              originalName: null,
              libraryId: 2,
            },
          ]),
    );
    const kavita = createKavitaClient({ url: "http://kavita", apiKey: "k" }, fetch);

    expect(await syncKavita(db, kavita)).toEqual({ ok: true, value: { series: 2 } });
    expect(ownedTitles(db, ["L’étranger", "ベルセルク", "Dune"])).toEqual(
      new Set([titleKey("L'Etranger"), titleKey("ベルセルク")]),
    );

    // A second sync replaces the previous index.
    const empty = createKavitaClient(
      { url: "http://kavita", apiKey: "k" },
      fakeFetch((url) =>
        url.pathname === "/api/Plugin/authenticate" ? json({ token: "jwt" }) : json([]),
      ).fetch,
    );
    await syncKavita(db, empty);
    expect(ownedTitles(db, ["Berserk"]).size).toBe(0);
  });
});
