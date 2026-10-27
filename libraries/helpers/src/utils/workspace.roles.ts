// ViralGenHub: the words people see for roles.
//
// Two different things are both called "admin" in the code, so the screens
// must never show the raw values:
//   - the WORKSPACE role (Prisma `enum Role`, per UserOrganization row): the
//     person who created a workspace is SUPERADMIN of that workspace only.
//     Shown as Owner / Admin / Member.
//   - the PLATFORM flag `User.isSuperAdmin`: ViralGenHub staff. Only this flag
//     opens /admin, impersonation and the admin APIs. Shown as "Platform admin".
// Display only: the enum values and the database are unchanged.

export type WorkspaceRole = 'SUPERADMIN' | 'ADMIN' | 'USER';

type Label = { key: string; label: string };

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, Label> = {
  SUPERADMIN: { key: 'vgh_role_owner', label: 'Owner' },
  ADMIN: { key: 'vgh_role_admin', label: 'Admin' },
  USER: { key: 'vgh_role_member', label: 'Member' },
};

export const PLATFORM_ADMIN_LABEL: Label = {
  key: 'vgh_platform_admin',
  label: 'Platform admin',
};

type Translate = (key: string, fallback: string) => string;

// 'SUPERADMIN' -> 'Owner'; unknown or empty -> ''.
export const workspaceRoleLabel = (
  role?: string | null,
  t?: Translate
): string => {
  const entry =
    role && Object.prototype.hasOwnProperty.call(WORKSPACE_ROLE_LABELS, role)
      ? WORKSPACE_ROLE_LABELS[role as WorkspaceRole]
      : undefined;
  if (!entry) {
    return '';
  }
  return t ? t(entry.key, entry.label) : entry.label;
};

export const platformAdminLabel = (t?: Translate) =>
  t ? t(PLATFORM_ADMIN_LABEL.key, PLATFORM_ADMIN_LABEL.label) : PLATFORM_ADMIN_LABEL.label;
