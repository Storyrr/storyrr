import "@tanstack/react-start/server-only";

import { DEFAULT_AUDIBLE_REGION } from "#/lib/audible-regions";
import type { SettingsStore } from "#/server/settings/store";
import {
  audiobookshelfConnection,
  chaptarrConnection,
  hardcoverToken,
  kavitaConnection,
  komgaConnection,
  metadataSettings,
} from "#/server/settings/definitions";

import { createAudibleClient } from "./audible/client";
import { createAudiobookshelfClient } from "./audiobookshelf/client";
import { createChaptarrClient } from "./chaptarr/client";
import { createHardcoverClient } from "./hardcover/client";
import { createKavitaClient } from "./kavita/client";
import { createKomgaClient } from "./komga/client";
import type { FetchFn } from "./result";

/** Builds service clients from the stored settings (null when a service isn't configured). */
export function createServices(store: SettingsStore, fetch: FetchFn) {
  return {
    async chaptarr() {
      const connection = await store.get(chaptarrConnection);
      return connection ? createChaptarrClient(connection, fetch) : null;
    },
    async audiobookshelf() {
      const connection = await store.get(audiobookshelfConnection);
      return connection ? createAudiobookshelfClient(connection, fetch) : null;
    },
    async kavita() {
      const connection = await store.get(kavitaConnection);
      return connection ? createKavitaClient(connection, fetch) : null;
    },
    async komga() {
      const connection = await store.get(komgaConnection);
      return connection ? createKomgaClient(connection, fetch) : null;
    },
    async hardcover() {
      const token = await store.get(hardcoverToken);
      return token ? createHardcoverClient({ token, fetch }) : null;
    },
    async audible() {
      const metadata = await store.get(metadataSettings);
      return createAudibleClient({
        fetch,
        region: metadata?.audibleRegion ?? DEFAULT_AUDIBLE_REGION,
      });
    },
  };
}

export type Services = ReturnType<typeof createServices>;
