import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckIcon, XIcon } from "lucide-react";

import { SettingsRow, SettingsSection } from "#/components/settings/settings-section";
import { accountQuery } from "#/lib/queries/profile";
import type { RequestQuota } from "#/lib/requests";
import { m } from "#/paraglide/messages.js";

function Allowed({ value, label }: { value: boolean; label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      {value ? (
        <CheckIcon className="size-4 text-primary" aria-hidden />
      ) : (
        <XIcon className="size-4 text-muted-foreground" aria-hidden />
      )}
      {label}
    </p>
  );
}

function quotaText(quota: RequestQuota) {
  if (quota.limit === null || quota.remaining === null) return m.settings_limit_unlimited();
  return m.request_quota_left({ remaining: quota.remaining, limit: quota.limit, days: quota.days });
}

/** What the user may do, read-only: admins change it on the Users page. */
export function PermissionSettings() {
  const { data: account } = useSuspenseQuery(accountQuery());
  return (
    <SettingsSection
      title={m.profile_permissions_title()}
      description={m.profile_permissions_description()}
    >
      <SettingsRow label={m.field_role()}>
        <Allowed
          value={account.isAdmin}
          label={account.isAdmin ? m.profile_permission_admin() : m.role_user()}
        />
      </SettingsRow>
      <SettingsRow label={m.profile_permission_auto_approve()}>
        <Allowed
          value={account.autoApproved}
          label={account.autoApproved ? m.profile_yes() : m.profile_no()}
        />
      </SettingsRow>
      <SettingsRow label={m.settings_chaptarr_audiobooks()}>
        <p className="text-sm">{quotaText(account.quotas.audiobook)}</p>
      </SettingsRow>
      <SettingsRow label={m.settings_chaptarr_ebooks()}>
        <p className="text-sm">{quotaText(account.quotas.ebook)}</p>
      </SettingsRow>
    </SettingsSection>
  );
}
