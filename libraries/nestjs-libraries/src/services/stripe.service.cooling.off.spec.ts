// ViralGenHub #210: the cooling-off refund arithmetic. Pure functions, nothing
// connects to Stripe or a database. The service's constructor dependencies
// drag in the whole integration tree (ESM-only providers jest cannot load),
// so they are stubbed: only the exported helpers are under test.
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({
    UsersService: class {},
  })
);
jest.mock('@gitroom/nestjs-libraries/track/track.service', () => ({
  TrackService: class {},
}));

import {
  COOLING_OFF_DAYS,
  coolingOffRefund,
  coolingOffUntil,
} from './stripe.service';

const DAY = 24 * 60 * 60;

describe('cooling-off refund', () => {
  const start = 1_700_000_000;
  const end = start + 30 * DAY;

  it('refunds the unused share of the period, rounded down', () => {
    // 10 of 30 days used: 2/3 of 799p = 532.66 -> 532
    expect(coolingOffRefund(799, start, end, start + 10 * DAY)).toBe(532);
  });

  it('refunds everything when nothing was used yet', () => {
    expect(coolingOffRefund(799, start, end, start)).toBe(799);
  });

  it('never exceeds what was paid, even with a clock before the period', () => {
    expect(coolingOffRefund(799, start, end, start - DAY)).toBe(799);
  });

  it('never goes negative after the period end', () => {
    expect(coolingOffRefund(799, start, end, end + DAY)).toBe(0);
  });

  it('refunds nothing on a free (trial) invoice or a broken period', () => {
    expect(coolingOffRefund(0, start, end, start)).toBe(0);
    expect(coolingOffRefund(799, end, start, start)).toBe(0);
    expect(coolingOffRefund(799, start, start, start)).toBe(0);
  });

  it('handles a yearly period the same way', () => {
    const yearEnd = start + 365 * DAY;
    // 7 of 365 days used of 19,990p
    expect(coolingOffRefund(19990, start, yearEnd, start + 7 * DAY)).toBe(
      Math.floor((19990 * 358) / 365)
    );
  });
});

describe('cooling-off window', () => {
  it(`ends ${COOLING_OFF_DAYS} days after the subscription was created`, () => {
    const created = 1_700_000_000;
    expect(coolingOffUntil(created).getTime()).toBe(
      (created + COOLING_OFF_DAYS * DAY) * 1000
    );
  });
});
