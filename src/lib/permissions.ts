/**
 * Seerr-like permissions (decided 2026-11-24). `admin` is the better-auth
 * role and grants everything; the others are stored per user (or the
 * defaults from Settings → Users apply).
 */
export const PERMISSIONS = [
  "admin",
  "manage_users",
  "manage_requests",
  "manage_settings",
  "manage_issues",
  "manage_blocklist",
  "request_audiobook",
  "request_ebook",
  "auto_approve_audiobook",
  "auto_approve_ebook",
  "request_advanced",
  "view_requests",
  "create_issues",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Everything but `admin`, which is the account's role. */
export const ASSIGNABLE_PERMISSIONS = PERMISSIONS.filter(
  (p): p is Exclude<Permission, "admin"> => p !== "admin",
);
export type AssignablePermission = (typeof ASSIGNABLE_PERMISSIONS)[number];

export const DEFAULT_PERMISSIONS: readonly AssignablePermission[] = [
  "request_audiobook",
  "request_ebook",
  "create_issues",
];

/** Permissions that come with another (Seerr: managing requests auto-approves yours). */
const IMPLIED: Partial<Record<Permission, readonly Permission[]>> = {
  manage_requests: [
    "request_advanced",
    "view_requests",
    "auto_approve_audiobook",
    "auto_approve_ebook",
  ],
  manage_issues: ["create_issues"],
};

/** The permissions a set of granted ones adds up to (`admin`: all of them). */
export function expandPermissions(granted: readonly Permission[]): Permission[] {
  if (granted.includes("admin")) return [...PERMISSIONS];
  const all = new Set<Permission>(granted);
  for (const p of granted) for (const implied of IMPLIED[p] ?? []) all.add(implied);
  return PERMISSIONS.filter((p) => all.has(p));
}

/**
 * Whether an account holds a permission the caller lacks. A user manager who
 * isn't an admin can't change such an account, nor grant what they lack:
 * otherwise they could hand themselves (through an account they create) any
 * permission.
 */
export function holdsMoreThan(
  account: readonly Permission[],
  caller: readonly Permission[],
): boolean {
  if (caller.includes("admin")) return false;
  return expandPermissions(account).some((p) => !caller.includes(p));
}

export function hasPermission(effective: readonly Permission[], permission: Permission): boolean {
  return effective.includes("admin") || effective.includes(permission);
}

/** For permission checkboxes: shown nested under their parent, implied when the parent is on. */
export const PERMISSION_TREE: readonly {
  permission: AssignablePermission;
  children?: readonly AssignablePermission[];
}[] = [
  { permission: "manage_users" },
  { permission: "manage_settings" },
  { permission: "manage_requests", children: ["request_advanced", "view_requests"] },
  { permission: "request_audiobook", children: ["auto_approve_audiobook"] },
  { permission: "request_ebook", children: ["auto_approve_ebook"] },
  { permission: "manage_issues", children: ["create_issues"] },
  { permission: "manage_blocklist" },
];

export const impliedBy = (permission: Permission): Permission[] =>
  PERMISSIONS.filter((p) => IMPLIED[p]?.includes(permission));

/** Whether the signed-in user (from the router context) may do something; the server re-checks. */
export const can = (user: { permissions: readonly Permission[] }, permission: Permission) =>
  hasPermission(user.permissions, permission);
