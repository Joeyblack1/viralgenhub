// Two different "admins" (Joseph, 27 Oct 2026): the person who creates a
// workspace gets the WORKSPACE role SUPERADMIN (shown as "Owner"); only the
// PLATFORM flag User.isSuperAdmin opens /admin. These tests pin that a
// workspace Owner who is not a platform admin is refused everywhere in the
// admin API, and that no admin route checks the workspace role instead.
import { readFileSync } from 'fs';
import { join } from 'path';

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

const spyAll = () =>
  new Proxy(
    {},
    {
      get: (target: any, prop: string) =>
        (target[prop] ??= jest.fn().mockResolvedValue({})),
    }
  );

describe('AdminController: workspace Owner is not a platform admin', () => {
  const services = [spyAll(), spyAll(), spyAll(), spyAll(), spyAll()];
  const controller = new AdminController(
    ...(services as [any, any, any, any, any])
  );
  // what the auth middleware puts on the request for someone who created
  // their own workspace (UserOrganization.role = SUPERADMIN)
  const owner: any = {
    id: 'owner1',
    email: 'owner@x.test',
    isSuperAdmin: false,
    organizations: [{ role: 'SUPERADMIN' }],
  };

  const calls: Array<[string, () => Promise<unknown>]> = [
    ['GET /admin/errors', () => controller.listErrors(owner)],
    ['GET /admin/errors/platforms', () => controller.listPlatforms(owner)],
    ['GET /admin/users', () => controller.listUsers(owner)],
    [
      'POST /admin/users/:id/disabled',
      () => controller.setUserDisabled(owner, 'u2', { disabled: true } as any),
    ],
    ['GET /admin/early-access', () => controller.listEarlyAccess(owner)],
    [
      'POST /admin/early-access/:id/approve',
      () => controller.approveEarlyAccess(owner, '1'),
    ],
    [
      'POST /admin/early-access/notify/:provider',
      () => controller.notifyEarlyAccess(owner, 'mewe'),
    ],
    ['GET /admin/settings-check', () => controller.getSettingsCheck(owner)],
    ['GET /admin/x-spend', () => controller.getXSpend(owner)],
    ['GET /admin/stats', () => controller.getStats(owner)],
  ];

  it.each(calls)('%s refuses a workspace Owner', async (_name, call) => {
    await expect(Promise.resolve().then(call)).rejects.toBeDefined();
  });

  it('never reached a service for the workspace Owner', () => {
    for (const service of services) {
      for (const fn of Object.values(service as Record<string, jest.Mock>)) {
        expect(fn).not.toHaveBeenCalled();
      }
    }
  });

  it('covers every route of the controller', () => {
    const source = readFileSync(join(__dirname, 'admin.controller.ts'), 'utf8');
    const routes = source.match(/@(Get|Post|Put|Patch|Delete)\(/g) || [];
    expect(routes.length).toBe(calls.length);
  });
});

describe('admin and impersonation code checks the platform flag, never the workspace role', () => {
  const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

  it('every admin route starts with assertSuperAdmin (User.isSuperAdmin)', () => {
    const source = read('admin.controller.ts');
    const bodies = source.split(/@(?:Get|Post|Put|Patch|Delete)\(/).slice(1);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).toMatch(/this\.assertSuperAdmin\(user\)/);
    }
    expect(source).toMatch(/if \(!user\?\.isSuperAdmin\)/);
    expect(source).not.toMatch(/['"]SUPERADMIN['"]|Role\.SUPERADMIN/);
  });

  it('impersonation (users.controller + auth middleware) is gated on isSuperAdmin', () => {
    const users = read('users.controller.ts');
    for (const route of ["@Get('/impersonate')", "@Post('/impersonate')", "@Post('/switch')"]) {
      const at = users.indexOf(route);
      expect(at).toBeGreaterThan(-1);
      expect(users.slice(at, at + 600)).toMatch(/if \(!user\.isSuperAdmin\)/);
    }
    const middleware = read('../../services/auth/auth.middleware.ts');
    expect(middleware).toMatch(/if \(user\?\.isSuperAdmin && impersonate\)/);
    expect(middleware).not.toMatch(/['"]SUPERADMIN['"]|Role\.SUPERADMIN/);
  });
});
