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

describe('AdminController settings check', () => {
  const settings: any = { check: jest.fn().mockReturnValue({ checks: [] }) };
  const controller = new AdminController(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    settings
  );

  it('refuses non-super-admins', async () => {
    await expect(
      controller.getSettingsCheck({ id: 'u', isSuperAdmin: false } as any)
    ).rejects.toBeDefined();
    expect(settings.check).not.toHaveBeenCalled();
  });

  it('returns the check to a super admin', async () => {
    await expect(
      controller.getSettingsCheck({ id: 'u', isSuperAdmin: true } as any)
    ).resolves.toEqual({ checks: [] });
  });
});
