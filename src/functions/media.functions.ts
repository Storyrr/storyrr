import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { availabilityFromRequest } from "#/lib/request-status";
import { AsinSchema, SearchInputSchema } from "#/lib/schemas/requests";
import { requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { ownedAsins } from "#/server/library";
import { activeRequestsByExternalId, isAutoApproved } from "#/server/requests/queries";
import { services } from "#/server/services";

/** Audiobook search with each result's status for this library. Signed-in users. */
export const searchAudiobooks = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(SearchInputSchema)
  .handler(async ({ data }) => {
    const audible = await services.audible();
    const result = await audible.search(data.query);
    if (!result.ok) return { ok: false as const, error: result.error };
    const asins = result.value.map((item) => item.externalId);
    const owned = ownedAsins(db, asins);
    const requests = activeRequestsByExternalId(db, {
      source: "audible",
      format: "audiobook",
      externalIds: asins,
    });
    return {
      ok: true as const,
      results: result.value.map((item) => ({
        ...item,
        availability: owned.has(item.externalId.toUpperCase())
          ? ("available" as const)
          : availabilityFromRequest(requests.get(item.externalId)?.status),
      })),
    };
  });

/** One audiobook with its status, who requested it, and whether a request is auto-approved. */
export const getAudiobook = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(v.object({ asin: AsinSchema }))
  .handler(async ({ data, context }) => {
    const audible = await services.audible();
    const result = await audible.getByAsin(data.asin);
    if (!result.ok) return { ok: false as const, error: result.error };
    const owned = ownedAsins(db, [data.asin]).has(data.asin);
    const active = activeRequestsByExternalId(db, {
      source: "audible",
      format: "audiobook",
      externalIds: [data.asin],
    }).get(data.asin);
    const isAdmin = context.session.user.role === "admin";
    return {
      ok: true as const,
      item: result.value,
      availability: owned ? ("available" as const) : availabilityFromRequest(active?.status),
      request: active ? { status: active.status, requesterName: active.requesterName } : null,
      autoApproved: isAutoApproved(db, context.session.user.id, isAdmin),
    };
  });
