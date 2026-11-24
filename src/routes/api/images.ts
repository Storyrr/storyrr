import { createFileRoute } from "@tanstack/react-router";

import { auth } from "#/server/auth";
import { getEnv } from "#/server/env";
import {
  cachedImage,
  getNetworkSettings,
  imageCacheDir,
  isAllowedImageUrl,
} from "#/server/network";
import { settings } from "#/server/settings";

/**
 * GET /api/images?url=<cover URL>: covers served by Storyrr from its disk
 * cache (Settings → Network). Signed-in users, provider image hosts only.
 */
export const Route = createFileRoute("/api/images")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await getNetworkSettings(settings)).imageCache)
          return new Response("Image cache is off", { status: 404 });
        if (!(await auth.api.getSession({ headers: request.headers })))
          return new Response("Unauthorized", { status: 401 });
        const url = isAllowedImageUrl(new URL(request.url).searchParams.get("url") ?? "");
        if (!url) return new Response("Not an allowed image", { status: 400 });
        try {
          const image = await cachedImage(imageCacheDir(getEnv().DATABASE_URL), url, fetch);
          if (!image) return new Response("Not an image", { status: 502 });
          return new Response(new Uint8Array(image.body), {
            headers: {
              "Content-Type": image.type,
              "Cache-Control": "private, max-age=604800, immutable",
            },
          });
        } catch (error) {
          console.warn(
            `[images] ${url.hostname}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return new Response("Upstream error", { status: 502 });
        }
      },
    },
  },
});
