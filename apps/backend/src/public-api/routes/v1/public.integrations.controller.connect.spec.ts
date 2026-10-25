// The heavy imports of the controller are not what is under test; nothing here
// connects to anything.
jest.mock('@gitroom/backend/services/auth/permissions/permissions.ability', () => ({
  CheckPolicies: () => () => undefined,
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
}));
jest.mock('@gitroom/nestjs-libraries/upload/multer.stream.engine', () => ({
  streamUploadOptions: () => ({}),
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service', () => ({ AdminStatsService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/clipping/clipping.service', () => ({ ClippingService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/early-access/early.access.service', () => ({ EarlyAccessService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({ IntegrationService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/media/media.service', () => ({ MediaService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/notifications/notification.service', () => ({ NotificationService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({ OrganizationService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({ PostsService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service', () => ({ SubscriptionService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/users/users.service', () => ({ UsersService: class {} }));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({ IntegrationManager: class {} }));
jest.mock('@gitroom/nestjs-libraries/integrations/refresh.integration.service', () => ({ RefreshIntegrationService: class {} }));
jest.mock('@gitroom/nestjs-libraries/chat/validation.schemas.helper', () => ({ getValidationSchemas: () => ({}) }));
jest.mock('@gitroom/backend/services/auth/super.admin.guard', () => ({ SuperAdminGuard: class {} }));
jest.mock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }), {
  virtual: true,
});

import { PublicIntegrationsController } from './public.integrations.controller';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

const org: any = { id: 'org1' };

const build = (opts: {
  hidden: boolean;
  approved?: string[];
  ownInternalProvider?: string;
}) => {
  const provider = {
    generateAuthUrl: jest.fn().mockResolvedValue({
      codeVerifier: 'cv',
      state: 'st',
      url: 'https://provider.test/auth',
    }),
  };
  const manager: any = {
    getAllowedSocialsIntegrations: () => ['skool', 'x'],
    isAvailableTo: jest.fn(
      (id: string, _org: string, approved: string[]) =>
        !opts.hidden || approved.includes(id)
    ),
    getMigrationTarget: () => undefined,
    getSocialIntegration: () => provider,
  };
  const integrationService: any = {
    getIntegrationByInternalId: jest.fn().mockResolvedValue(
      opts.ownInternalProvider
        ? { providerIdentifier: opts.ownInternalProvider }
        : null
    ),
  };
  const early: any = {
    approvedProviders: jest.fn().mockResolvedValue(opts.approved || []),
  };
  const controller = new PublicIntegrationsController(
    integrationService,
    {} as any,
    {} as any,
    {} as any,
    manager,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    early
  );
  return { controller, provider };
};

// Launch hardening: the public API connect route used the same provider gate
// as the dashboard route, and a client-supplied `refresh` must not skip it
describe('PublicIntegrationsController.getIntegrationUrl', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses a hidden provider for an unapproved organization', async () => {
    const { controller, provider } = build({ hidden: true });
    await expect(
      controller.getIntegrationUrl('skool', undefined as any, org)
    ).rejects.toMatchObject({ status: 400 });
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
    expect(ioRedis.set).not.toHaveBeenCalled();
  });

  it('does not trust a refresh value that is not an own channel of the provider', async () => {
    const { controller } = build({ hidden: true });
    await expect(
      controller.getIntegrationUrl('skool', 'someone-elses-id', org)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('allows reconnecting an own channel of a hidden provider', async () => {
    const { controller } = build({ hidden: true, ownInternalProvider: 'skool' });
    await expect(
      controller.getIntegrationUrl('skool', 'own-id', org)
    ).resolves.toEqual({ url: 'https://provider.test/auth' });
  });

  it('allows a hidden provider for an approved organization', async () => {
    const { controller } = build({ hidden: true, approved: ['skool'] });
    await expect(
      controller.getIntegrationUrl('skool', undefined as any, org)
    ).resolves.toEqual({ url: 'https://provider.test/auth' });
  });

  it('is unchanged for normal providers', async () => {
    const { controller } = build({ hidden: false });
    await expect(
      controller.getIntegrationUrl('x', undefined as any, org)
    ).resolves.toEqual({ url: 'https://provider.test/auth' });
  });
});
