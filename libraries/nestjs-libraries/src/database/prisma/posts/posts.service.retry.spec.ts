import 'reflect-metadata';
// the service only needs the shape of its dependencies; the real ones load
// every provider SDK, storage client and a Redis connection
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository',
  () => ({ PostsRepository: class {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));

import { PostsService } from './posts.service';

// "Retry this channel only": one failed channel of a post group is re-queued
// on its own; the group's other channels are never touched.

const xProvider = { name: 'X', planPostsLimit: 'x_posts_per_month' };

const failed = (over: any = {}) => ({
  id: 'p-tiktok',
  group: 'g1',
  state: 'ERROR',
  parentPostId: null,
  releaseId: null,
  releaseURL: null,
  deletedAt: null,
  integrationId: 'i-tiktok',
  publishDate: new Date('2026-10-27T19:00:00Z'),
  error: 'App not approved for public posting',
  ...over,
  integration: {
    providerIdentifier: 'tiktok',
    disabled: false,
    refreshNeeded: false,
    deletedAt: null,
    ...(over.integration || {}),
  },
});

const setup = (post: any, opts: { live?: number; requeued?: number; reread?: any; tier?: string; used?: number } = {}) => {
  const repo = {
    getPostById: jest
      .fn()
      .mockResolvedValueOnce(post)
      .mockResolvedValue(opts.reread ?? post),
    countLiveThreadItems: jest.fn().mockResolvedValue(opts.live ?? 0),
    requeueFailedPost: jest
      .fn()
      .mockResolvedValue({ count: opts.requeued ?? 1 }),
    countProviderPostsBetween: jest.fn().mockResolvedValue(opts.used ?? 0),
    // anything that would touch the whole group must never be called
    changeDate: jest.fn(),
    changeState: jest.fn(),
    createOrUpdatePost: jest.fn(),
    deletePost: jest.fn(),
  };
  const manager = {
    getSocialIntegration: jest.fn((id: string) =>
      id === 'x' ? xProvider : { name: id }
    ),
    getAllowedSocialsIntegrations: jest.fn().mockReturnValue(['x', 'tiktok']),
  };
  const subscriptions = {
    getSubscriptionByOrganizationId: jest
      .fn()
      .mockResolvedValue({ subscriptionTier: opts.tier || 'STANDARD' }),
  };
  const service = new PostsService(
    repo as any,
    manager as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    subscriptions as any
  );
  const startWorkflow = jest.fn().mockResolvedValue(undefined);
  (service as any).startWorkflow = startWorkflow;
  return { service, repo, startWorkflow };
};

const untouchedGroup = (repo: any) => {
  expect(repo.changeDate).not.toHaveBeenCalled();
  expect(repo.changeState).not.toHaveBeenCalled();
  expect(repo.createOrUpdatePost).not.toHaveBeenCalled();
  expect(repo.deletePost).not.toHaveBeenCalled();
};

describe('PostsService.retryFailedPost', () => {
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.STRIPE_PUBLISHABLE_KEY;
  });

  it('re-queues only that channel, publishing now, and starts its workflow once', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-28T08:30:00Z'));
    const { service, repo, startWorkflow } = setup(failed());

    await expect(service.retryFailedPost('org1', 'p-tiktok')).resolves.toEqual({
      id: 'p-tiktok',
      state: 'QUEUE',
      queued: true,
    });

    expect(repo.getPostById).toHaveBeenCalledWith('p-tiktok', 'org1');
    expect(repo.requeueFailedPost).toHaveBeenCalledTimes(1);
    const [org, id, when] = repo.requeueFailedPost.mock.calls[0];
    expect(org).toBe('org1');
    expect(id).toBe('p-tiktok');
    expect(when.toISOString()).toBe('2026-10-28T08:30:00.000Z');
    expect(repo.countLiveThreadItems).toHaveBeenCalledWith(
      'org1',
      'g1',
      'i-tiktok'
    );
    expect(startWorkflow).toHaveBeenCalledTimes(1);
    expect(startWorkflow).toHaveBeenCalledWith(
      'tiktok',
      'p-tiktok',
      'org1',
      'QUEUE'
    );
    untouchedGroup(repo);
  });

  it('uses the provider queue of a dashed identifier (instagram-standalone)', async () => {
    const { service, startWorkflow } = setup(
      failed({ integration: { providerIdentifier: 'instagram-standalone' } })
    );
    await service.retryFailedPost('org1', 'p-tiktok');
    expect(startWorkflow.mock.calls[0][0]).toBe('instagram');
  });

  it('answers a second click while queued without starting anything', async () => {
    const { service, repo, startWorkflow } = setup(failed({ state: 'QUEUE' }));
    await expect(service.retryFailedPost('org1', 'p-tiktok')).resolves.toEqual({
      id: 'p-tiktok',
      state: 'QUEUE',
      queued: false,
    });
    expect(repo.requeueFailedPost).not.toHaveBeenCalled();
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it('a click that loses the race (no row updated) starts nothing', async () => {
    const { service, startWorkflow } = setup(failed(), {
      requeued: 0,
      reread: failed({ state: 'QUEUE' }),
    });
    await expect(service.retryFailedPost('org1', 'p-tiktok')).resolves.toEqual({
      id: 'p-tiktok',
      state: 'QUEUE',
      queued: false,
    });
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it('refuses when the row changed under it (published or deleted meanwhile)', async () => {
    const { service, startWorkflow } = setup(failed(), {
      requeued: 0,
      reread: failed({ state: 'PUBLISHED' }),
    });
    await expect(
      service.retryFailedPost('org1', 'p-tiktok')
    ).rejects.toMatchObject({ status: 400 });
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it.each([
    ['missing (other workspace)', null, 404],
    ['deleted', failed({ deletedAt: new Date() }), 404],
    ['published', failed({ state: 'PUBLISHED' }), 400],
    ['a draft', failed({ state: 'DRAFT' }), 400],
    ['a thread reply', failed({ parentPostId: 'p-root' }), 400],
    ['accepted by the platform (releaseURL)', failed({ releaseURL: 'https://x/1' }), 400],
    ['accepted by the platform (releaseId)', failed({ releaseId: 'missing' }), 400],
    ['on a removed channel', failed({ integration: { deletedAt: new Date() } }), 400],
    ['on a disabled channel', failed({ integration: { disabled: true } }), 400],
    ['on a channel to reconnect', failed({ integration: { refreshNeeded: true } }), 400],
  ])('refuses a post that is %s', async (_name, post, status) => {
    const { service, repo, startWorkflow } = setup(post);
    await expect(
      service.retryFailedPost('org1', 'p-tiktok')
    ).rejects.toMatchObject({ status });
    expect(repo.requeueFailedPost).not.toHaveBeenCalled();
    expect(startWorkflow).not.toHaveBeenCalled();
    untouchedGroup(repo);
  });

  it('refuses when an item of the thread is already live on the platform', async () => {
    const { service, repo, startWorkflow } = setup(failed(), { live: 1 });
    await expect(
      service.retryFailedPost('org1', 'p-tiktok')
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.requeueFailedPost).not.toHaveBeenCalled();
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it('counts the retry in the plan cap of the month it now publishes in', async () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T10:00:00Z'));
    const x = failed({ integration: { providerIdentifier: 'x' } });

    const full = setup(x, { used: 20 });
    await expect(
      full.service.retryFailedPost('org1', 'p-tiktok')
    ).rejects.toMatchObject({ status: 402 });
    expect(full.repo.requeueFailedPost).not.toHaveBeenCalled();

    const room = setup(x, { used: 10 });
    await room.service.retryFailedPost('org1', 'p-tiktok');
    const [, , from, , exclude] =
      room.repo.countProviderPostsBetween.mock.calls[0];
    expect(from.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(exclude).toEqual(['p-tiktok']);
    expect(room.repo.requeueFailedPost).toHaveBeenCalled();
  });
});
