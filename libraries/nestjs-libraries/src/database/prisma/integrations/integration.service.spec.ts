import 'reflect-metadata';
// only the shape of the dependencies is needed; the real ones load every
// provider SDK, storage client and a Redis connection
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository',
  () => ({ IntegrationRepository: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository',
  () => ({ AutopostRepository: class {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));

import { IntegrationService } from './integration.service';
import { Plug } from '@gitroom/helpers/decorators/plug.decorator';

const field = {
  name: 'f',
  description: '',
  type: 'text',
  placeholder: '',
};

class FakeX {
  @Plug({
    identifier: 'x-autoRepostPost',
    title: 'repost',
    description: '',
    runEveryMilliseconds: 1,
    totalRuns: 3,
    fields: [field],
  })
  repost = jest.fn().mockResolvedValue(true);

  @Plug({
    identifier: 'x-autoPlugPost',
    title: 'plug',
    description: '',
    runEveryMilliseconds: 1,
    totalRuns: 3,
    createsPost: true,
    fields: [field],
  })
  plugPost = jest.fn();
}

const setup = (plugFunction: string, result: boolean) => {
  const provider = new FakeX();
  provider.plugPost.mockResolvedValue(result);
  provider.repost.mockResolvedValue(result);
  const repo = {
    getPlug: jest.fn().mockResolvedValue({
      id: 'plug1',
      organizationId: 'org',
      integrationId: 'i1',
      plugFunction,
      data: '[]',
      integration: { providerIdentifier: 'x' },
    }),
  };
  const service = new IntegrationService(
    repo as any,
    {} as any,
    { getSocialIntegration: () => provider } as any,
    {} as any,
    {} as any,
    {} as any
  );
  const cap = {
    allow: jest.fn().mockResolvedValue(true),
    record: jest.fn().mockResolvedValue(undefined),
  };
  return { service, provider, cap };
};

const run = {
  plugId: 'plug1',
  postId: 't1',
  delay: 0,
  totalRuns: 3,
  currentRun: 1,
};

describe('IntegrationService.processPlugs, plan post cap', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('skips a plug that creates a post when the org is over the cap', async () => {
    const { service, provider, cap } = setup('plugPost', true);
    cap.allow.mockResolvedValue(false);
    await expect(service.processPlugs(run, cap)).resolves.toBe(true);
    expect(cap.allow).toHaveBeenCalledWith('org', 'x');
    expect(provider.plugPost).not.toHaveBeenCalled();
    expect(cap.record).not.toHaveBeenCalled();
  });

  it('records the post when the plug fires, not when it only waits', async () => {
    const fired = setup('plugPost', true);
    await fired.service.processPlugs(run, fired.cap);
    expect(fired.cap.record).toHaveBeenCalledWith('org', 'x');

    const waiting = setup('plugPost', false);
    await expect(waiting.service.processPlugs(run, waiting.cap)).resolves.toBe(
      false
    );
    expect(waiting.cap.record).not.toHaveBeenCalled();
  });

  it('does not check or count a plug that is not a new post (a repost)', async () => {
    const { service, provider, cap } = setup('repost', true);
    await expect(service.processPlugs(run, cap)).resolves.toBe(true);
    expect(provider.repost).toHaveBeenCalled();
    expect(cap.allow).not.toHaveBeenCalled();
    expect(cap.record).not.toHaveBeenCalled();
  });

  it('runs as before without a cap', async () => {
    const { service, provider } = setup('plugPost', true);
    await expect(service.processPlugs(run)).resolves.toBe(true);
    expect(provider.plugPost).toHaveBeenCalled();
  });
});
