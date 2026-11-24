import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { FormError, FormSuccess } from "#/components/form/form-error";
import { SwitchField } from "#/components/form/switch-field";
import { RequestLimitFields } from "#/components/settings/request-limit-fields";
import { PermissionChecklist } from "#/components/users/permission-checklist";
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
  setUserBanned,
  setUserLimits,
  setUserPermissionList,
  setUserRole,
} from "#/functions/users.functions";
import { accountQuery, profileKeys } from "#/lib/queries/profile";
import { userSettingsQuery } from "#/lib/queries/settings";
import { userKeys } from "#/lib/queries/users";
import type { AssignablePermission, Permission } from "#/lib/permissions";
import type { RequestQuota } from "#/lib/requests";
import type { RequestLimits } from "#/lib/schemas/settings";
import { ReadOnlyNotice } from "#/components/profile/read-only-notice";
import { can } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";

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
  if (can(user, "manage_users") && account.editable && !account.self)
    return <EditPermissions userId={account.id} />;
  return (
    <div className="flex flex-col gap-12">
      {account.self || !can(user, "manage_users") ? null : <ReadOnlyNotice account={account} />}
      <SettingsSection
        title={m.profile_permissions_title()}
        description={m.profile_permissions_description()}
      >
        <PermissionChecklist
          label={m.profile_permissions_title()}
          value={account.permissions.filter(isAssignable)}
          onChange={() => undefined}
          isDisabled
          admin={{ isSelected: account.isAdmin, isDisabled: true, onChange: () => undefined }}
        />
      </SettingsSection>
      <SettingsSection title={m.users_limits()}>
        <SettingsRow label={m.settings_chaptarr_audiobooks()}>
          <p className="text-sm">{quotaText(account.quotas.audiobook)}</p>
        </SettingsRow>
        <SettingsRow label={m.settings_chaptarr_ebooks()}>
          <p className="text-sm">{quotaText(account.quotas.ebook)}</p>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

const isAssignable = (p: Permission): p is AssignablePermission => p !== "admin";

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
  const { user: me } = useRouteContext({ from: "/_authed" });
  const roleFn = useServerFn(setUserRole);
  const permissionsFn = useServerFn(setUserPermissionList);
  const bannedFn = useServerFn(setUserBanned);
  const limitsFn = useServerFn(setUserLimits);
  const role = useAccountMutation((admin: boolean) =>
    roleFn({ data: { userId, role: admin ? "admin" : "user" } }),
  );
  const savePermissions = useAccountMutation((value: AssignablePermission[] | null) =>
    permissionsFn({ data: { userId, permissions: value } }),
  );
  const [useDefaults, setUseDefaults] = useState(account.grantedPermissions === null);
  const [granted, setGranted] = useState<AssignablePermission[]>(
    account.grantedPermissions ?? defaults.defaultPermissions,
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
  const error = role.error ?? savePermissions.error ?? banned.error ?? limits.error;

  return (
    <div className="flex flex-col gap-12">
      <SettingsSection
        title={m.profile_permissions_title()}
        description={m.users_permissions_description()}
      >
        <FieldGroup>
          <FormError message={error ? error.message || m.error_generic() : null} />
          <SwitchField
            label={m.users_use_default_permissions()}
            isSelected={useDefaults && !account.isAdmin}
            isDisabled={account.isAdmin}
            onChange={(value) => {
              setUseDefaults(value);
              if (value) setGranted(defaults.defaultPermissions);
            }}
          />
          <PermissionChecklist
            label={m.profile_permissions_title()}
            value={useDefaults ? defaults.defaultPermissions : granted}
            onChange={setGranted}
            isDisabled={useDefaults || account.isAdmin}
            admin={{
              isSelected: account.isAdmin,
              // Only admins grant or remove the admin role.
              isDisabled: !me.isAdmin || role.isPending,
              onChange: (value) => role.mutate(value),
            }}
          />
          <SettingsActions>
            <Button
              isDisabled={savePermissions.isPending || account.isAdmin}
              onPress={() => savePermissions.mutate(useDefaults ? null : granted)}
            >
              {savePermissions.isPending ? <Spinner data-icon="inline-start" /> : null}
              {savePermissions.isSuccess ? m.action_saved() : m.action_save()}
            </Button>
          </SettingsActions>
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
