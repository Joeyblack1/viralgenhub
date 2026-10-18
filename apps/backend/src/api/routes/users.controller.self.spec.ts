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

import { UsersController } from './users.controller';

// #148: GET /user/self must never carry the password hash
describe('UsersController.getSelf', () => {
  it('drops password even if the middleware loaded it', async () => {
    const controller = new UsersController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    const res: any = await controller.getSelf(
      { id: 'u1', email: 'u@x.test', password: 'bcrypt-hash', isSuperAdmin: false } as any,
      { id: 'org1', users: [{ role: 'ADMIN' }], apiKey: 'k' } as any,
      { cookies: {}, headers: {} } as any
    );
    expect(res).not.toHaveProperty('password');
    expect(JSON.stringify(res)).not.toContain('bcrypt-hash');
    expect(res.id).toBe('u1');
    expect(res.orgId).toBe('org1');
  });
});
