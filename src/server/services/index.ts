import "@tanstack/react-start/server-only";

import { DEFAULT_AUDIBLE_REGION } from "#/lib/audible-regions";
import { settings, type SettingsStore } from "#/server/settings";
import {
  audiobookshelfConnection,
  chaptarrConnection,
  metadataSettings,
} from "#/server/settings/definitions";

import { createAudibleClient } from "./audible/client";
import { createAudiobookshelfClient } from "./audiobookshelf/client";
import { createChaptarrClient } from "./chaptarr/client";
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

/** The app's service clients, using the global fetch. */
export const services = createServices(settings, (input, init) => fetch(input, init));
