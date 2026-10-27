import {
  platformAdminLabel,
  WORKSPACE_ROLE_LABELS,
  workspaceRoleLabel,
} from './workspace.roles';

describe('workspaceRoleLabel', () => {
  it('shows the workspace roles as Owner, Admin and Member', () => {
    expect(workspaceRoleLabel('SUPERADMIN')).toBe('Owner');
    expect(workspaceRoleLabel('ADMIN')).toBe('Admin');
    expect(workspaceRoleLabel('USER')).toBe('Member');
  });

  it('never shows a raw enum value or "super admin" for a workspace role', () => {
    for (const role of Object.keys(WORKSPACE_ROLE_LABELS)) {
      const label = workspaceRoleLabel(role);
      expect(label).not.toMatch(/super/i);
      expect(label).not.toBe(role);
    }
  });

  it('returns an empty string for a missing or unknown role', () => {
    expect(workspaceRoleLabel(undefined)).toBe('');
    expect(workspaceRoleLabel(null)).toBe('');
    expect(workspaceRoleLabel('')).toBe('');
    expect(workspaceRoleLabel('OWNER')).toBe('');
    expect(workspaceRoleLabel('toString')).toBe('');
  });

  it('passes the translation key and the English fallback to t', () => {
    const t = jest.fn((key: string, fallback: string) => `${key}|${fallback}`);
    expect(workspaceRoleLabel('SUPERADMIN', t)).toBe('vgh_role_owner|Owner');
    expect(platformAdminLabel(t)).toBe('vgh_platform_admin|Platform admin');
  });

  it('names the platform flag differently from every workspace role', () => {
    const workspaceLabels = Object.keys(WORKSPACE_ROLE_LABELS).map((r) =>
      workspaceRoleLabel(r)
    );
    expect(workspaceLabels).not.toContain(platformAdminLabel());
    expect(platformAdminLabel()).toBe('Platform admin');
  });
});
