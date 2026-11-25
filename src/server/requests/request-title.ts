import "@tanstack/react-start/server-only";
import type * as v from "valibot";

import { formatList } from "#/lib/format";
import { isLanguageAccepted, languageName } from "#/lib/languages";
import { hasPermission, type Permission } from "#/lib/permissions";
import type { CreateRequestSchema } from "#/lib/schemas/requests";
import { m } from "#/paraglide/messages.js";
import { formatDefaults } from "#/server/settings/definitions";
import { mediaSources } from "#/server/sources";

import { findBlock } from "./blocklist";
import { getLanguagePolicy } from "./language-policy";
import { activeRequestsByExternalId, upsertMedia } from "./queries";
import { requestQuota } from "./quota";
import type { SubmitDeps } from "./submit";
import { createRequest } from "./transitions";

/** Why a request was refused, with the HTTP status the caller should get. */
export class RequestRefusedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RequestRefusedError";
  }
}

export type RequestCaller = {
  user: { id: string; role?: string | null };
  permissions: readonly Permission[];
};

export type RequestTitleDeps = SubmitDeps & {
  /** Called with a request that was approved right away (auto-approval): submit it. */
  onApproved: (requestId: string) => void;
};

/**
 * Requests one title for the caller, with every check (permission, blocklist,
 * language, limits). Throws `RequestRefusedError` with the reason.
 */
export async function requestTitle(
  { db, services, settings, onApproved }: RequestTitleDeps,
  { user, permissions }: RequestCaller,
  data: v.InferOutput<typeof CreateRequestSchema>,
) {
  const isAdmin = user.role === "admin";
  const format = data.media.type;
  if (!hasPermission(permissions, `request_${format}`)) {
    throw new RequestRefusedError(m.request_not_allowed(), 403);
  }
  // Picking the folder and profile is an advanced request option.
  const advanced = hasPermission(permissions, "request_advanced");
  const defaults = await settings.get(formatDefaults[format]);
  const rootFolderPath = (advanced ? data.rootFolderPath : undefined) ?? defaults?.rootFolderPath;
  if (!rootFolderPath) {
    throw new RequestRefusedError(
      format === "ebook"
        ? m.request_error_ebook_defaults_missing()
        : m.request_error_defaults_missing(),
      500,
    );
  }

  const details = await mediaSources[format].getDetails(services, data.media.id);
  if (!details.ok) throw new RequestRefusedError(details.error.message, 500);
  if (findBlock(db, details.value.source, details.value.externalId)) {
    throw new RequestRefusedError(m.request_blocked(), 409);
  }
  // Chaptarr would wait forever for a work its metadata profile filters out: refuse it here.
  const policy = await getLanguagePolicy({ services, settings }, format);
  if (policy && isLanguageAccepted(policy, details.value.languages) === false) {
    throw new RequestRefusedError(
      m.request_language_not_accepted({
        languages: formatList(policy.allowed.map(languageName)),
      }),
      422,
    );
  }

  // Joining someone else's active request costs nothing; a new one counts against the limit.
  const joins = activeRequestsByExternalId(db, {
    source: details.value.source,
    format,
    externalIds: [details.value.externalId],
  }).has(details.value.externalId);
  if (!joins) {
    const quota = await requestQuota({ db, settings }, { id: user.id, isAdmin }, format);
    if (quota.remaining === 0 && quota.limit !== null) {
      throw new RequestRefusedError(
        m.request_quota_exceeded({ limit: quota.limit, days: quota.days }),
        429,
      );
    }
  }

  const mediaId = upsertMedia(db, details.value);
  const result = createRequest(db, {
    mediaId,
    userId: user.id,
    format,
    target: { service: "chaptarr", rootFolderPath },
    qualityProfileId: advanced ? (data.qualityProfileId ?? null) : null,
    autoApprove: hasPermission(permissions, `auto_approve_${format}`),
  });
  if (result.kind === "created" && result.status === "approved") onApproved(result.requestId);
  return result;
}
