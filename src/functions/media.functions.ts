import { createServerFn } from "@tanstack/react-start";

import { isLanguageAccepted, type LanguagePolicy } from "#/lib/languages";
import { availabilityFromRequest } from "#/lib/request-status";
import { MediaRefSchema, SearchInputSchema } from "#/lib/schemas/requests";
import { requireUser } from "#/server/auth/middleware";
import { db } from "#/server/db";
import { getLanguagePolicy } from "#/server/requests/language-policy";
import { activeRequestsByExternalId, isAutoApproved } from "#/server/requests/queries";
import { services } from "#/server/services";
import { settings } from "#/server/settings";
import { mediaSources } from "#/server/sources";

/** Accepted (true) first, then unknown (null), then refused (false); stable otherwise. */
const ACCEPTANCE_ORDER = new Map<boolean | null, number>([
  [true, 0],
  [null, 1],
  [false, 2],
]);

const languageInfo = (policy: LanguagePolicy | null) => ({
  acceptedLanguages: policy?.allowed ?? null,
});

/** Search one media type, with each result's status for this library. Signed-in users. */
export const searchMedia = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(SearchInputSchema)
  .handler(async ({ data }) => {
    const source = mediaSources[data.type];
    const [result, policy] = await Promise.all([
      source.search(services, data.query),
      getLanguagePolicy({ services, settings }, data.type),
    ]);
    if (!result.ok) return { ok: false as const, error: result.error };
    const owned = source.owned(db, result.value);
    const requests = activeRequestsByExternalId(db, {
      source: source.source,
      format: source.type,
      externalIds: result.value.map((item) => item.externalId),
    });
    const results = result.value.map((item) => ({
      ...item,
      availability: owned.has(item.externalId)
        ? ("available" as const)
        : availabilityFromRequest(requests.get(item.externalId)?.status),
      /** Whether Chaptarr's metadata profile accepts the work's languages (null: can't tell). */
      accepted: isLanguageAccepted(policy, item.languages),
    }));
    // Array.prototype.sort is stable: provider relevance is kept within each group.
    results.sort(
      (a, b) => (ACCEPTANCE_ORDER.get(a.accepted) ?? 1) - (ACCEPTANCE_ORDER.get(b.accepted) ?? 1),
    );
    return { ok: true as const, results, ...languageInfo(policy) };
  });

/** One item with its status, who requested it, and whether a request is auto-approved. */
export const getMedia = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(MediaRefSchema)
  .handler(async ({ data, context }) => {
    const source = mediaSources[data.type];
    const [result, policy] = await Promise.all([
      source.getDetails(services, data.id),
      getLanguagePolicy({ services, settings }, data.type),
    ]);
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
      accepted: isLanguageAccepted(policy, result.value.languages),
      ...languageInfo(policy),
    };
  });
