import { createServerFn } from "@tanstack/react-start";

import { availabilityFromRequest } from "#/lib/request-status";
import { MediaRefSchema, SearchInputSchema } from "#/lib/schemas/requests";
import { requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { activeRequestsByExternalId, isAutoApproved } from "#/server/requests/queries";
import { services } from "#/server/services";
import { mediaSources } from "#/server/sources";

/** Search one media type, with each result's status for this library. Signed-in users. */
export const searchMedia = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(SearchInputSchema)
  .handler(async ({ data }) => {
    const source = mediaSources[data.type];
    const result = await source.search(services, data.query);
    if (!result.ok) return { ok: false as const, error: result.error };
    const owned = source.owned(db, result.value);
    const requests = activeRequestsByExternalId(db, {
      source: source.source,
      format: source.type,
      externalIds: result.value.map((item) => item.externalId),
    });
    return {
      ok: true as const,
      results: result.value.map((item) => ({
        ...item,
        availability: owned.has(item.externalId)
          ? ("available" as const)
          : availabilityFromRequest(requests.get(item.externalId)?.status),
      })),
    };
  });

/** One item with its status, who requested it, and whether a request is auto-approved. */
export const getMedia = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(MediaRefSchema)
  .handler(async ({ data, context }) => {
    const source = mediaSources[data.type];
    const result = await source.getDetails(services, data.id);
    if (!result.ok) return { ok: false as const, error: result.error };
    const owned = source.owned(db, [result.value]).has(result.value.externalId);
    const active = activeRequestsByExternalId(db, {
      source: source.source,
      format: source.type,
      externalIds: [result.value.externalId],
    }).get(result.value.externalId);
    const isAdmin = context.session.user.role === "admin";
    return {
      ok: true as const,
      item: result.value,
      availability: owned ? ("available" as const) : availabilityFromRequest(active?.status),
      request: active ? { status: active.status, requesterName: active.requesterName } : null,
      autoApproved: isAutoApproved(db, context.session.user.id, isAdmin),
    };
  });
