import { useId } from "react";

import { Checkbox } from "#/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "#/components/ui/field";
import {
  PERMISSION_TREE,
  expandPermissions,
  impliedBy,
  type AssignablePermission,
  type Permission,
} from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";

const labels: Record<Permission, { label: () => string; description: () => string }> = {
  admin: { label: m.permission_admin, description: m.permission_admin_description },
  manage_users: {
    label: m.permission_manage_users,
    description: m.permission_manage_users_description,
  },
  manage_settings: {
    label: m.permission_manage_settings,
    description: m.permission_manage_settings_description,
  },
  manage_requests: {
    label: m.permission_manage_requests,
    description: m.permission_manage_requests_description,
  },
  request_advanced: {
    label: m.permission_request_advanced,
    description: m.permission_request_advanced_description,
  },
  view_requests: {
    label: m.permission_view_requests,
    description: m.permission_view_requests_description,
  },
  request_audiobook: {
    label: m.permission_request_audiobook,
    description: m.permission_request_audiobook_description,
  },
  auto_approve_audiobook: {
    label: m.permission_auto_approve_audiobook,
    description: m.permission_auto_approve_audiobook_description,
  },
  request_ebook: {
    label: m.permission_request_ebook,
    description: m.permission_request_ebook_description,
  },
  auto_approve_ebook: {
    label: m.permission_auto_approve_ebook,
    description: m.permission_auto_approve_ebook_description,
  },
  manage_issues: {
    label: m.permission_manage_issues,
    description: m.permission_manage_issues_description,
  },
  create_issues: {
    label: m.permission_create_issues,
    description: m.permission_create_issues_description,
  },
  manage_blocklist: {
    label: m.permission_manage_blocklist,
    description: m.permission_manage_blocklist_description,
  },
};

function PermissionOption({
  permission,
  isSelected,
  isDisabled,
  onChange,
}: {
  permission: Permission;
  isSelected: boolean;
  isDisabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal" data-disabled={isDisabled || undefined}>
      <Checkbox id={id} isSelected={isSelected} isDisabled={isDisabled} onChange={onChange} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{labels[permission].label()}</FieldLabel>
        <FieldDescription>{labels[permission].description()}</FieldDescription>
      </FieldContent>
    </Field>
  );
}

/**
 * Seerr-like permission checkboxes. Children sit under their parent; a
 * permission implied by another checked one (e.g. Manage requests → View
 * requests) shows checked and locked. `admin` (optional) locks everything on.
 */
export function PermissionChecklist({
  label,
  value,
  onChange,
  isDisabled = false,
  admin,
}: {
  label: string;
  value: readonly AssignablePermission[];
  onChange: (value: AssignablePermission[]) => void;
  isDisabled?: boolean;
  admin?: { isSelected: boolean; isDisabled: boolean; onChange: (value: boolean) => void };
}) {
  const effective = expandPermissions(admin?.isSelected ? ["admin"] : value);
  const toggle = (permission: AssignablePermission, on: boolean) =>
    onChange(on ? [...value, permission] : value.filter((p) => p !== permission));
  const option = (permission: AssignablePermission) => {
    const implied =
      admin?.isSelected || impliedBy(permission).some((p) => p !== "admin" && value.includes(p));
    return (
      <PermissionOption
        key={permission}
        permission={permission}
        isSelected={effective.includes(permission)}
        isDisabled={isDisabled || implied}
        onChange={(on) => toggle(permission, on)}
      />
    );
  };

  return (
    <FieldSet>
      <FieldLegend className="sr-only">{label}</FieldLegend>
      <div className="flex flex-col gap-4">
        {admin ? (
          <PermissionOption
            permission="admin"
            isSelected={admin.isSelected}
            isDisabled={isDisabled || admin.isDisabled}
            onChange={admin.onChange}
          />
        ) : null}
        {PERMISSION_TREE.map(({ permission, children }) => (
          <div key={permission} className="flex flex-col gap-3">
            {option(permission)}
            {children ? (
              <div className="ms-7 flex flex-col gap-3">{children.map(option)}</div>
            ) : null}
          </div>
        ))}
      </div>
    </FieldSet>
  );
}
