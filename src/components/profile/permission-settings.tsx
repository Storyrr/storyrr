import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { SwitchField } from "#/components/form/switch-field";
import { RequestLimitFields } from "#/components/settings/request-limit-fields";
import {
  SettingsActions,
  SettingsRow,
  SettingsSection,
} from "#/components/settings/settings-section";
import { Button } from "#/components/ui/button";
import { FieldGroup } from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import {
  setUserAutoApprove,
  setUserBanned,
  setUserLimits,
  setUserRole,
} from "#/functions/users.functions";
import { accountQuery, profileKeys } from "#/lib/queries/profile";
import { userSettingsQuery } from "#/lib/queries/settings";
import { userKeys } from "#/lib/queries/users";
import type { RequestQuota } from "#/lib/requests";
import type { RequestLimits } from "#/lib/schemas/settings";
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

/**
 * Permissions tab. Read-only on one's own account; admins edit other
 * accounts' role, auto-approval, request limits and ban here.
 */
export function PermissionSettings({ userId }: { userId?: string }) {
  const { user } = useRouteContext({ from: "/_authed" });
  const { data: account } = useSuspenseQuery(accountQuery(userId));
  if (user.isAdmin && !account.self) return <EditPermissions userId={account.id} />;
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

function useAccountMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.all }),
        queryClient.invalidateQueries({ queryKey: userKeys.all }),
      ]),
  });
}

function EditPermissions({ userId }: { userId: string }) {
  const { data: account } = useSuspenseQuery(accountQuery(userId));
  const { data: defaults } = useSuspenseQuery(userSettingsQuery());
  const roleFn = useServerFn(setUserRole);
  const autoApproveFn = useServerFn(setUserAutoApprove);
  const bannedFn = useServerFn(setUserBanned);
  const limitsFn = useServerFn(setUserLimits);
  const role = useAccountMutation((admin: boolean) =>
    roleFn({ data: { userId, role: admin ? "admin" : "user" } }),
  );
  const autoApprove = useAccountMutation((value: boolean) =>
    autoApproveFn({ data: { userId, autoApprove: value } }),
  );
  const banned = useAccountMutation((value: boolean) =>
    bannedFn({ data: { userId, banned: value } }),
  );
  const limits = useAccountMutation((value: RequestLimits | null) =>
    limitsFn({ data: { userId, requestLimits: value } }),
  );
  const [override, setOverride] = useState(account.requestLimits !== null);
  const [ownLimits, setOwnLimits] = useState<RequestLimits>(
    account.requestLimits ?? defaults.requestLimits,
  );
  const error = role.error ?? autoApprove.error ?? banned.error ?? limits.error;

  return (
    <div className="flex flex-col gap-12">
      <SettingsSection
        title={m.profile_permissions_title()}
        description={m.users_permissions_description()}
      >
        <FieldGroup>
          <FormError message={error ? error.message || m.error_generic() : null} />
          <SettingsRow label={m.role_admin()} description={m.users_admin_description()}>
            <Switch
              aria-label={m.role_admin()}
              isSelected={account.isAdmin}
              isDisabled={role.isPending}
              onChange={(value) => role.mutate(value)}
            />
          </SettingsRow>
          <SettingsRow
            label={m.field_auto_approve()}
            description={account.isAdmin ? m.users_admin_auto_approved() : undefined}
          >
            <Switch
              aria-label={m.field_auto_approve()}
              isSelected={account.isAdmin || account.autoApprove}
              isDisabled={account.isAdmin || autoApprove.isPending}
              onChange={(value) => autoApprove.mutate(value)}
            />
          </SettingsRow>
          <SettingsRow label={m.users_banned()} description={m.users_ban_description()}>
            <Switch
              aria-label={m.users_banned()}
              isSelected={account.banned}
              isDisabled={banned.isPending}
              onChange={(value) => banned.mutate(value)}
            />
          </SettingsRow>
        </FieldGroup>
      </SettingsSection>
      {account.isAdmin ? null : (
        <SettingsSection title={m.users_limits()} description={m.users_limits_description()}>
          <FieldGroup>
            {limits.isSuccess ? <FormSuccess message={m.action_saved()} /> : null}
            <SettingsRow label={m.users_limits_custom()}>
              <SwitchField
                label={m.users_limits_override()}
                isSelected={override}
                onChange={setOverride}
              />
            </SettingsRow>
            {override ? (
              <>
                <RequestLimitFields
                  label={m.settings_limit_audiobook()}
                  layout="row"
                  value={ownLimits.audiobook}
                  onChange={(audiobook) => setOwnLimits({ ...ownLimits, audiobook })}
                />
                <RequestLimitFields
                  label={m.settings_limit_ebook()}
                  layout="row"
                  value={ownLimits.ebook}
                  onChange={(ebook) => setOwnLimits({ ...ownLimits, ebook })}
                />
              </>
            ) : null}
          </FieldGroup>
          <SettingsActions>
            <Button
              isDisabled={limits.isPending}
              onPress={() => limits.mutate(override ? ownLimits : null)}
            >
              {limits.isPending ? <Spinner data-icon="inline-start" /> : null}
              {m.action_save()}
            </Button>
          </SettingsActions>
        </SettingsSection>
      )}
    </div>
  );
}
