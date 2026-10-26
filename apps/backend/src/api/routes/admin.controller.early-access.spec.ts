jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/errors/errors.service',
  () => ({ ErrorsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service',
  () => ({ AdminStatsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/early-access/early.access.service',
  () => ({ EarlyAccessService: class {} })
);

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/admin-settings/admin-settings.service',
  () => ({ AdminSettingsService: class {} })
);

import { AdminController } from './admin.controller';

describe('AdminController early access', () => {
  const early: any = {
    adminList: jest.fn().mockResolvedValue({ providers: [] }),
    approve: jest.fn().mockResolvedValue({ id: '1', status: 'approved' }),
    notifyWaitlist: jest.fn().mockResolvedValue({ notified: 0, failed: 0 }),
  };
  const controller = new AdminController(
    {} as any,
    {} as any,
    {} as any,
    early,
    {} as any
  );

  it('refuses non-super-admins on every route', async () => {
    const user: any = { id: 'u', isSuperAdmin: false };
    await expect(controller.listEarlyAccess(user)).rejects.toBeDefined();
    await expect(
      controller.approveEarlyAccess(user, '1')
    ).rejects.toBeDefined();
    await expect(
      controller.notifyEarlyAccess(user, 'mewe')
    ).rejects.toBeDefined();
    expect(early.approve).not.toHaveBeenCalled();
    expect(early.notifyWaitlist).not.toHaveBeenCalled();
  });

  it('lets a super admin approve and notify', async () => {
    const user: any = { id: 'u', isSuperAdmin: true };
    await controller.approveEarlyAccess(user, '1');
    await controller.notifyEarlyAccess(user, 'mewe');
    expect(early.approve).toHaveBeenCalledWith('1');
    expect(early.notifyWaitlist).toHaveBeenCalledWith('mewe');
  });
});
