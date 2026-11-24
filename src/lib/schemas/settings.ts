import * as v from "valibot";

import { AUDIBLE_REGION_CODES } from "#/lib/audible-regions";
import { ASSIGNABLE_PERMISSIONS, DEFAULT_PERMISSIONS } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";

/** Services connected with a URL and an API / Auth key. */
export const SERVICES = ["chaptarr", "audiobookshelf", "kavita", "komga"] as const;
export type ServiceName = (typeof SERVICES)[number];

/** Every external service whose errors the UI explains. */
export const EXTERNAL_SERVICES = [
  "chaptarr",
  "audiobookshelf",
  "kavita",
  "komga",
  "hardcover",
  "audible",
] as const;
export type ExternalService = (typeof EXTERNAL_SERVICES)[number];

/** Formats Chaptarr fetches. */
export const CHAPTARR_FORMATS = ["audiobook", "ebook"] as const;
export type ChaptarrFormat = (typeof CHAPTARR_FORMATS)[number];

/** A service connection as edited in the form. A blank API key keeps the stored one. */
export const ConnectionFormSchema = v.object({
  url: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty(() => m.validation_required()),
    v.url(() => m.validation_url()),
    v.regex(/^https?:\/\//i, () => m.validation_url()),
  ),
  apiKey: v.pipe(v.string(), v.trim()),
});
export type ConnectionForm = v.InferOutput<typeof ConnectionFormSchema>;

export const ServiceInputSchema = v.object({ service: v.picklist(SERVICES) });

/** Services whose saved key or token an admin can reveal in its settings field. */
export const RevealSecretSchema = v.object({ service: v.picklist([...SERVICES, "hardcover"]) });

export const ServiceConnectionInputSchema = v.object({
  service: v.picklist(SERVICES),
  connection: ConnectionFormSchema,
});

export const MetadataSettingsSchema = v.object({
  audibleRegion: v.picklist(AUDIBLE_REGION_CODES, () => m.validation_required()),
});
export type MetadataSettings = v.InferOutput<typeof MetadataSettingsSchema>;

/** Where requests of one format go by default, and with which Chaptarr profiles. */
export const FormatDefaultsSchema = v.object({
  rootFolderPath: v.pipe(
    v.string(),
    v.nonEmpty(() => m.validation_required()),
  ),
  qualityProfileId: v.pipe(
    v.number(() => m.validation_required()),
    v.integer(),
  ),
  metadataProfileId: v.pipe(
    v.number(() => m.validation_required()),
    v.integer(),
  ),
});
export type FormatDefaults = v.InferOutput<typeof FormatDefaultsSchema>;

export const SaveFormatDefaultsSchema = v.object({
  format: v.picklist(CHAPTARR_FORMATS),
  defaults: FormatDefaultsSchema,
});

export const FormatInputSchema = v.object({ format: v.picklist(CHAPTARR_FORMATS) });

/** The Hardcover API token as edited in the form. Blank keeps the stored one. */
export const HardcoverTokenFormSchema = v.object({ token: v.pipe(v.string(), v.trim()) });
export type HardcoverTokenForm = v.InferOutput<typeof HardcoverTokenFormSchema>;

/** Libraries Storyrr reads from a media server. */
export const LIBRARY_SERVICES = ["audiobookshelf", "kavita", "komga"] as const;
export type LibraryService = (typeof LIBRARY_SERVICES)[number];

/** Libraries left out of availability. Stored as exclusions so new libraries count by default. */
export const LibrarySelectionSchema = v.object({ excluded: v.array(v.string()) });
export type LibrarySelection = v.InferOutput<typeof LibrarySelectionSchema>;

export const LibraryServiceInputSchema = v.object({ service: v.picklist(LIBRARY_SERVICES) });
export const SaveLibrarySelectionSchema = v.object({
  service: v.picklist(LIBRARY_SERVICES),
  selection: LibrarySelectionSchema,
});

/** How many requests of one format a user may make per period; `limit: null` is unlimited. */
export const RequestLimitSchema = v.object({
  limit: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000))),
  days: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365)),
});
export type RequestLimit = v.InferOutput<typeof RequestLimitSchema>;
export const RequestLimitsSchema = v.object({
  audiobook: RequestLimitSchema,
  ebook: RequestLimitSchema,
});
export type RequestLimits = v.InferOutput<typeof RequestLimitsSchema>;
export const UNLIMITED: RequestLimit = { limit: null, days: 7 };
export const DEFAULT_REQUEST_LIMITS: RequestLimits = { audiobook: UNLIMITED, ebook: UNLIMITED };

export const AssignablePermissionsSchema = v.array(v.picklist(ASSIGNABLE_PERMISSIONS));

/** Settings → Users: permissions of new accounts and the global request limits. */
export const UserSettingsSchema = v.object({
  // Optional: settings saved before permissions existed have none.
  defaultPermissions: v.optional(AssignablePermissionsSchema, () => [...DEFAULT_PERMISSIONS]),
  requestLimits: RequestLimitsSchema,
});
export type UserSettings = v.InferOutput<typeof UserSettingsSchema>;
/** The Settings → Users form (every field required). */
export const UserSettingsFormSchema = v.object({
  defaultPermissions: AssignablePermissionsSchema,
  requestLimits: RequestLimitsSchema,
});
export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultPermissions: [...DEFAULT_PERMISSIONS],
  requestLimits: DEFAULT_REQUEST_LIMITS,
};

/** Settings → Network. */
export const NetworkSettingsSchema = v.object({
  /** http(s)://[user:pass@]host:port for Storyrr's outbound calls; empty: none. */
  proxyUrl: v.pipe(
    v.string(),
    v.trim(),
    v.check(
      (value) => value === "" || /^https?:\/\/[^\s]+$/i.test(value),
      () => m.validation_url(),
    ),
  ),
  /** Hosts reached directly, comma-separated (e.g. chaptarr, *.lan). */
  noProxy: v.pipe(v.string(), v.trim(), v.maxLength(1000)),
  /** Serve covers through Storyrr, cached on disk. */
  imageCache: v.boolean(),
});
export type NetworkSettings = v.InferOutput<typeof NetworkSettingsSchema>;
export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  proxyUrl: "",
  noProxy: "",
  imageCache: false,
};
