import type { UserRole } from "#/lib/schemas/users";
import { m } from "#/paraglide/messages.js";

export const roleLabels: Record<UserRole, () => string> = {
  user: m.role_user,
  admin: m.role_admin,
};
