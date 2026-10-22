// The heavy imports of the controller (Stripe, auth, Sentry...) are not what is
// under test; nothing here connects to anything.
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));
jest.mock('@gitroom/backend/services/auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock('@gitroom/backend/services/auth/permissions/permissions.ability', () => ({
  CheckPolicies: () => () => undefined,
}));
jest.mock('@gitroom/nestjs-libraries/services/payment/payment.service', () => ({
  PaymentService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/users/users.service', () => ({
  UsersService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/track/track.service', () => ({
  TrackService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing', () => ({
  pricing: {},
  TRIALS_ENABLED: false,
}));

import { Logger } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { UsersController } from './users.controller';

const SECRET = 'test-secret';

const build = () => {
  const userService: any = {
    getUserById: jest.fn(async () => ({ id: 'admin1', email: 'admin@x.test' })),
  };
  const orgService: any = {
    getUserOrg: jest.fn(async () => ({
      user: { id: 'target1', email: 'target@x.test', password: 'hash' },
      organization: { id: 'org1' },
    })),
  };
  const controller = new UsersController(
    {} as any,
    {} as any,
    {} as any,
    orgService,
    userService,
    {} as any
  );
  return { controller, userService, orgService };
};

const request = (userId: string) =>
  ({
    cookies: { auth: sign({ id: userId }, SECRET), impersonate: 'COOKIE-VALUE' },
    headers: {},
  }) as any;

const response = () => ({ cookie: jest.fn(), header: jest.fn() }) as any;

describe('super-admin impersonation audit', () => {
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;
  const env = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    process.env.FRONTEND_URL = 'https://app.example.test';
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...env };
  });

  const lines = () => log.mock.calls.map((c) => String(c[0]));

  it('logs who, whom, when and the IP when an impersonation starts', async () => {
    const { controller, orgService } = build();
    const admin: any = { id: 'admin1', email: 'admin@x.test', isSuperAdmin: true };
    const res = response();

    await controller.setImpersonate(admin, 'uo-1', res, request('admin1'), '203.0.113.9');

    expect(orgService.getUserOrg).toHaveBeenCalledWith('uo-1');
    expect(res.cookie).toHaveBeenCalledWith('impersonate', 'uo-1', expect.anything());
    const [line] = lines();
    expect(line).toMatch(/^AUDIT impersonation start \{/);
    const body = JSON.parse(line.slice('AUDIT impersonation start '.length));
    expect(body).toMatchObject({
      adminId: 'admin1',
      adminEmail: 'admin@x.test',
      targetUserId: 'target1',
      targetEmail: 'target@x.test',
      targetOrgId: 'org1',
      ip: '203.0.113.9',
    });
    expect(new Date(body.at).getTime()).not.toBeNaN();
  });

  it('logs the end when the id is empty', async () => {
    const { controller, orgService } = build();
    const admin: any = { id: 'admin1', email: 'admin@x.test', isSuperAdmin: true };

    await controller.setImpersonate(admin, '', response(), request('admin1'), '1.2.3.4');

    expect(orgService.getUserOrg).not.toHaveBeenCalled();
    expect(lines()[0]).toMatch(/^AUDIT impersonation end \{/);
    expect(lines()[0]).toContain('"adminId":"admin1"');
  });

  it('takes the admin from the auth token while already impersonating', async () => {
    const { controller, userService } = build();
    // `user` is the previously impersonated account
    const impersonated: any = { id: 'target0', email: 't0@x.test', isSuperAdmin: true };

    await controller.setImpersonate(impersonated, 'uo-2', response(), request('admin1'), '1.2.3.4');

    expect(userService.getUserById).toHaveBeenCalledWith('admin1');
    expect(lines()[0]).toContain('"adminId":"admin1"');
    expect(lines()[0]).toContain('"adminEmail":"admin@x.test"');
  });

  it('logs a denied attempt and does not set the cookie', async () => {
    const { controller } = build();
    const user: any = { id: 'u9', email: 'u9@x.test', isSuperAdmin: false };
    const res = response();

    await expect(
      controller.setImpersonate(user, 'uo-1', res, request('u9'), '1.2.3.4')
    ).rejects.toThrow('Unauthorized');

    expect(res.cookie).not.toHaveBeenCalled();
    expect(lines()[0]).toMatch(/^AUDIT impersonation denied \{/);
    expect(lines()[0]).toContain('"userId":"u9"');
  });

  it('never logs the auth token or the impersonate cookie', async () => {
    const { controller } = build();
    const admin: any = { id: 'admin1', email: 'admin@x.test', isSuperAdmin: true };
    const req = request('admin1');

    await controller.setImpersonate(admin, 'uo-1', response(), req, '1.2.3.4');

    const all = JSON.stringify([...log.mock.calls, ...error.mock.calls]);
    expect(all).not.toContain(req.cookies.auth);
    expect(all).not.toContain('COOKIE-VALUE');
    expect(all).not.toContain('hash');
  });

  it('still impersonates when the audit lookup fails, and says so', async () => {
    const { controller, orgService } = build();
    orgService.getUserOrg.mockRejectedValue(new Error('db down'));
    const admin: any = { id: 'admin1', email: 'admin@x.test', isSuperAdmin: true };
    const res = response();

    await controller.setImpersonate(admin, 'uo-1', res, request('admin1'), '1.2.3.4');

    expect(res.cookie).toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain('could not be fully recorded');
  });
});
