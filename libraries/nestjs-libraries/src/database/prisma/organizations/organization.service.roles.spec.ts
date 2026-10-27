// The Public API's super-admin routes (SuperAdminGuard: /public/v1/users,
// /debug/*, /credits/reset, and the x-postiz-org override) are open only to a
// workspace that has a PLATFORM admin (User.isSuperAdmin) and no other
// Owner/Admin. Being the Owner (role SUPERADMIN) of a workspace is not enough.
jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service',
  () => ({ AutopostService: class {} })
);

import { OrganizationRepository } from './organization.repository';
import { OrganizationService } from './organization.service';

type Member = {
  organizationId: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'USER';
  disabled: boolean;
  user: { isSuperAdmin: boolean; deletedAt: null };
};

// Evaluates the repository's Prisma `where` against an in-memory table, so the
// test checks the real query the repository builds.
const matches = (row: Member, where: any): boolean =>
  row.organizationId === where.organizationId &&
  row.disabled === where.disabled &&
  (!where.role?.in || where.role.in.includes(row.role)) &&
  (where.user?.isSuperAdmin === undefined ||
    row.user.isSuperAdmin === where.user.isSuperAdmin);

const serviceWith = (members: Member[]) => {
  const userOrg: any = {
    model: {
      userOrganization: {
        findFirst: jest.fn(async ({ where }: any) =>
          members.find((m) => matches(m, where)) || null
        ),
      },
    },
  };
  const repo = new OrganizationRepository({} as any, userOrg, {} as any);
  return { service: new OrganizationService(repo, {} as any), userOrg };
};

const member = (
  role: Member['role'],
  isSuperAdmin: boolean
): Member => ({
  organizationId: 'org1',
  role,
  disabled: false,
  user: { isSuperAdmin, deletedAt: null },
});

describe('OrganizationService.canUseSuperAdminApi', () => {
  it('refuses a workspace whose Owner is an ordinary user', async () => {
    const { service } = serviceWith([member('SUPERADMIN', false)]);
    await expect(service.canUseSuperAdminApi('org1')).resolves.toBe(false);
  });

  it('allows the platform admin\'s own workspace', async () => {
    const { service } = serviceWith([member('SUPERADMIN', true)]);
    await expect(service.canUseSuperAdminApi('org1')).resolves.toBe(true);
  });

  it('refuses when an ordinary Owner/Admin shares the workspace with a platform admin', async () => {
    const { service } = serviceWith([
      member('SUPERADMIN', true),
      member('ADMIN', false),
    ]);
    await expect(service.canUseSuperAdminApi('org1')).resolves.toBe(false);
  });

  it('queries the platform flag, not the workspace role, to find the admin', async () => {
    const { service, userOrg } = serviceWith([member('SUPERADMIN', false)]);
    await service.canUseSuperAdminApi('org1');
    const wheres = userOrg.model.userOrganization.findFirst.mock.calls.map(
      (c: any[]) => c[0].where
    );
    const adminLookup = wheres.find((w: any) => w.user?.isSuperAdmin === true);
    expect(adminLookup).toBeDefined();
    expect(adminLookup.role).toBeUndefined();
  });
});

describe('OrganizationService.inviteTeamMember e-mail', () => {
  const send = async (role: string, orgName = 'Acme', inviterName = 'Ann') => {
    const sendEmail = jest.fn();
    const service = new OrganizationService({} as any, { sendEmail } as any);
    process.env.FRONTEND_URL = 'https://app.example.test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-spec';
    await service.inviteTeamMember(
      { id: 'org1', name: orgName } as any,
      { name: inviterName, email: 'ann@x.test' } as any,
      { email: 'new@x.test', role, sendEmail: true } as any
    );
    return sendEmail.mock.calls[0];
  };

  it('names the workspace role in words', async () => {
    const [, , memberBody] = await send('USER');
    expect(memberBody).toContain('You will join as a Member.');
    const [, , adminBody] = await send('ADMIN');
    expect(adminBody).toContain('You will join as an Admin.');
    expect(adminBody).not.toMatch(/SUPERADMIN|super admin/i);
  });

  it('escapes user-typed names in the HTML body', async () => {
    const [, , body] = await send('USER', '<a href="x">Win</a>', '<b>Eve</b>');
    expect(body).not.toContain('<a href="x">');
    expect(body).not.toContain('<b>Eve</b>');
    expect(body).toContain('&lt;a href=&quot;x&quot;&gt;Win&lt;/a&gt;');
  });
});
