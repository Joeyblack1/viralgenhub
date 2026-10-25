// The services PermissionsService injects are not what is under test; nothing
// here connects to anything.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({
  PostsService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({ WebhooksService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service',
  () => ({ AutopostService: class {} })
);

import { PermissionsService } from './permissions.service';
import { AuthorizationActions, Sections } from './permission.exception.class';
import { CHECK_POLICIES_KEY } from './permissions.ability';
import { AutopostController } from '@gitroom/backend/api/routes/autopost.controller';

const service = (tier?: string, webhooks = 0) =>
  new PermissionsService(
    {
      getSubscriptionByOrganizationId: jest
        .fn()
        .mockResolvedValue(tier ? { subscriptionTier: tier } : null),
    } as any,
    {} as any,
    {} as any,
    { getTotal: jest.fn().mockResolvedValue(webhooks) } as any
  );

const canAutoPost = async (tier?: string, webhooks = 0) =>
  (
    await service(tier, webhooks).check('org', new Date(), 'ADMIN', [
      [AuthorizationActions.Create, Sections.AUTO_POST],
    ])
  ).can(AuthorizationActions.Create, Sections.AUTO_POST);

describe('PermissionsService, auto-post (RSS) gate', () => {
  beforeEach(() => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
  });
  afterEach(() => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
  });

  it('follows the plan autoPost flag: Free and Creator no, Business yes', async () => {
    expect(await canAutoPost()).toBe(false);
    expect(await canAutoPost('FREE')).toBe(false);
    expect(await canAutoPost('STANDARD')).toBe(false);
    expect(await canAutoPost('TEAM')).toBe(true);
  });

  it('does not depend on the webhook count', async () => {
    expect(await canAutoPost('STANDARD', 0)).toBe(false);
    expect(await canAutoPost('TEAM', 1000)).toBe(true);
  });

  it('allows everything without Stripe (self-hosted)', async () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    expect(await canAutoPost('FREE')).toBe(true);
  });
});

describe('AutopostController policies', () => {
  const policies = (method: keyof AutopostController) =>
    Reflect.getMetadata(
      CHECK_POLICIES_KEY,
      AutopostController.prototype[method]
    ) as Array<[AuthorizationActions, Sections]> | undefined;

  it('gates create, update, switching on and the feed preview on autoPost', () => {
    for (const method of [
      'createAutopost',
      'updateAutopost',
      'changeActive',
      'sendWebhook',
    ] as const) {
      expect(policies(method)?.map(([, section]) => section)).toEqual([
        Sections.AUTO_POST,
      ]);
    }
  });

  it('keeps listing and deleting open', () => {
    expect(policies('getAutoposts')).toBeUndefined();
    expect(policies('deleteAutopost')).toBeUndefined();
  });
});
