/** Issue vocabulary shared by the UI and the server (client-safe). */
export const ISSUE_TYPES = ["language", "edition", "content", "audio", "other"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export const ISSUE_STATUSES = ["open", "resolved"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
