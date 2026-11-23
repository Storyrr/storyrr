import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/server/db";
import { services } from "#/server/services";
import { settings } from "#/server/settings";
import { handleChaptarrWebhook, isValidWebhookToken } from "#/server/webhooks/chaptarr";

/** Chaptarr → Settings → Connect → Webhook (POST), URL shown in Storyrr's Settings → Services. */
export const Route = createFileRoute("/api/webhooks/chaptarr")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        if (!(await isValidWebhookToken(settings, token)))
          return new Response(null, { status: 401 });
        const body: unknown = await request.json().catch(() => null);
        const result = await handleChaptarrWebhook({ db, services }, body);
        return Response.json(result);
      },
    },
  },
});
