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
import { latestWhatsNewId, WHATS_NEW } from '@gitroom/helpers/utils/whats.new';

// POST /user/whats-new/seen: remembers the newest "What's new" entry seen.
describe('UsersController.setWhatsNewSeen', () => {
  const make = () => {
    const users: any = { setWhatsNewSeen: jest.fn().mockResolvedValue(undefined) };
    const controller = new UsersController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      users,
      {} as any
    );
    return { controller, users };
  };
  const req = (impersonate?: string): any => ({
    cookies: impersonate ? { impersonate } : {},
    headers: {},
  });
  const latest = latestWhatsNewId();

  it('stores a known entry id for the signed-in user', async () => {
    const { controller, users } = make();
    const res = await controller.setWhatsNewSeen(
      { id: 'u1', whatsNewSeen: null } as any,
      { id: latest },
      req()
    );
    expect(users.setWhatsNewSeen).toHaveBeenCalledWith('u1', latest);
    expect(res).toEqual({ whatsNewSeen: latest, saved: true });
  });

  it('refuses an id that is not in the list', async () => {
    const { controller, users } = make();
    await expect(
      controller.setWhatsNewSeen({ id: 'u1' } as any, { id: '2099-01-01' }, req())
    ).rejects.toBeDefined();
    await expect(
      controller.setWhatsNewSeen({ id: 'u1' } as any, {} as any, req())
    ).rejects.toBeDefined();
    expect(users.setWhatsNewSeen).not.toHaveBeenCalled();
  });

  it('never moves backwards to an older entry', async () => {
    const { controller, users } = make();
    const older = WHATS_NEW[WHATS_NEW.length - 1].id;
    const res = await controller.setWhatsNewSeen(
      { id: 'u1', whatsNewSeen: latest } as any,
      { id: older },
      req()
    );
    expect(users.setWhatsNewSeen).not.toHaveBeenCalled();
    expect(res).toEqual({ whatsNewSeen: latest, saved: false });
  });

  it('does not mark it for the user a platform admin is viewing as', async () => {
    const { controller, users } = make();
    const res = await controller.setWhatsNewSeen(
      { id: 'target', whatsNewSeen: null } as any,
      { id: latest },
      req('target')
    );
    expect(users.setWhatsNewSeen).not.toHaveBeenCalled();
    expect(res.saved).toBe(false);
  });
});
