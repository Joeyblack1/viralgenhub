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

// X is capped per plan (x_posts_per_month: Free 0, Creator 100, Business 300)
const xProvider = { name: 'X', planPostsLimit: 'x_posts_per_month' };

const setup = (post: any, tier = 'STANDARD', used = 0) => {
  const repo = {
    getPostById: jest.fn().mockResolvedValue(post),
    changeDate: jest.fn().mockResolvedValue({ id: post.id }),
    countProviderPostsBetween: jest.fn().mockResolvedValue(used),
  };
  const manager = {
    getSocialIntegration: jest.fn((id: string) =>
      id === 'x' ? xProvider : { name: id }
    ),
    getAllowedSocialsIntegrations: jest.fn().mockReturnValue(['x', 'bluesky']),
  };
  const subscriptions = {
    getSubscriptionByOrganizationId: jest
      .fn()
      .mockResolvedValue({ subscriptionTier: tier }),
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
  // the workflow start is not under test
  (service as any).startWorkflow = jest.fn().mockResolvedValue(undefined);
  return { service, repo };
};

const queued = (providerIdentifier: string, state = 'QUEUE') => ({
  id: 'p1',
  state,
  publishDate: new Date('2026-11-05T10:00:00Z'),
  integration: { providerIdentifier },
});

describe('PostsService.changeDate, monthly X cap', () => {
  beforeEach(() => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
  });
  afterEach(() => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
  });

  it('refuses moving a queued X post into a month that is full', async () => {
    const { service, repo } = setup(queued('x'), 'STANDARD', 100);
    await expect(
      service.changeDate('org', 'p1', '2026-12-02T09:00:00Z', 'update')
    ).rejects.toMatchObject({ status: 402 });
    expect(repo.changeDate).not.toHaveBeenCalled();
  });

  it('counts the month of the NEW date', async () => {
    const { service, repo } = setup(queued('x'), 'STANDARD', 10);
    await service.changeDate('org', 'p1', '2026-12-02T09:00:00Z', 'update');
    const [, , from, to, exclude] =
      repo.countProviderPostsBetween.mock.calls[0];
    expect(from.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(exclude).toEqual(['p1']);
    expect(repo.changeDate).toHaveBeenCalled();
  });

  it('sends Free to a paid plan for any X date change', async () => {
    const { service } = setup(queued('x'), 'FREE', 0);
    await expect(
      service.changeDate('org', 'p1', '2026-12-02T09:00:00Z', 'update')
    ).rejects.toMatchObject({ status: 402 });
  });

  it('does not count a draft, a published-post date edit or other channels', async () => {
    for (const [post, action] of [
      [queued('x', 'DRAFT'), 'schedule'],
      [queued('x', 'PUBLISHED'), 'update'],
      [queued('bluesky'), 'update'],
    ] as const) {
      const { service, repo } = setup(post, 'FREE', 999);
      await service.changeDate('org', 'p1', '2026-12-02T09:00:00Z', action);
      expect(repo.countProviderPostsBetween).not.toHaveBeenCalled();
      expect(repo.changeDate).toHaveBeenCalled();
    }
  });

  it('counts a republish of a published post as a new post', async () => {
    const { service, repo } = setup(queued('x', 'PUBLISHED'), 'STANDARD', 100);
    await expect(
      service.changeDate('org', 'p1', '2026-12-02T09:00:00Z', 'schedule', true)
    ).rejects.toMatchObject({ status: 402 });
    expect(repo.countProviderPostsBetween.mock.calls[0][4]).toEqual([]);
  });
});

describe('PostsService.checkPlanPostsLimits, republish and plugs', () => {
  beforeEach(() => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
  });
  afterEach(() => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
  });

  const body = (republish?: boolean) =>
    ({
      type: 'schedule',
      date: '2026-12-02T09:00:00Z',
      republish,
      posts: [
        {
          settings: { __type: 'x' },
          value: [{ id: 'p1', content: 'hi' }],
        },
      ],
    } as any);

  it('counts a republish of a PUBLISHED post as a new post', async () => {
    const { service, repo } = setup(queued('x', 'PUBLISHED'), 'STANDARD', 100);
    await expect(
      service.checkPlanPostsLimits('org', [body(true)])
    ).rejects.toMatchObject({ status: 402 });
    // the published row stays in the count: it is not excluded
    expect(repo.countProviderPostsBetween.mock.calls[0][4]).toEqual([]);
  });

  it('still excludes the post a republish of a queued post overwrites', async () => {
    const { service, repo } = setup(queued('x', 'QUEUE'), 'STANDARD', 99);
    await service.checkPlanPostsLimits('org', [body(true)]);
    expect(repo.countProviderPostsBetween.mock.calls[0][4]).toEqual(['p1']);
  });

  it('a normal edit of a post excludes it and never looks it up', async () => {
    const { service, repo } = setup(queued('x'), 'STANDARD', 99);
    await service.checkPlanPostsLimits('org', [body()]);
    expect(repo.countProviderPostsBetween.mock.calls[0][4]).toEqual(['p1']);
    expect(repo.getPostById).not.toHaveBeenCalled();
  });

  describe('plugPostCap', () => {
    const redis = require('@gitroom/nestjs-libraries/redis/redis.service')
      .ioRedis as any;
    afterEach(() => {
      delete redis.get;
      delete redis.incr;
      delete redis.expire;
    });

    it('counts recorded plug posts against the cap', async () => {
      const { service } = setup(queued('x'), 'STANDARD', 99);
      redis.get = jest.fn().mockResolvedValue('1');
      await expect(service.plugPostCap.allow('org', 'x')).resolves.toBe(false);
      expect(redis.get.mock.calls[0][0]).toMatch(
        /^plug-posts:org:x_posts_per_month:\d{4}-\d{2}$/
      );
    });

    it('allows a plug while there is room and on Redis errors reading the count', async () => {
      const { service } = setup(queued('x'), 'STANDARD', 98);
      redis.get = jest.fn().mockResolvedValue('1');
      await expect(service.plugPostCap.allow('org', 'x')).resolves.toBe(true);
      redis.get = jest.fn().mockRejectedValue(new Error('down'));
      await expect(service.plugPostCap.allow('org', 'x')).resolves.toBe(true);
    });

    it('refuses Free and never throws', async () => {
      const { service, repo } = setup(queued('x'), 'FREE', 0);
      await expect(service.plugPostCap.allow('org', 'x')).resolves.toBe(false);
      repo.countProviderPostsBetween.mockRejectedValue(new Error('db'));
      const paid = setup(queued('x'), 'STANDARD', 0);
      paid.repo.countProviderPostsBetween.mockRejectedValue(new Error('db'));
      jest.spyOn(console, 'log').mockImplementation(() => {});
      await expect(paid.service.plugPostCap.allow('org', 'x')).resolves.toBe(
        false
      );
    });

    it('records a plug post in the month counter', async () => {
      const { service } = setup(queued('x'));
      redis.incr = jest.fn().mockResolvedValue(1);
      redis.expire = jest.fn().mockResolvedValue(1);
      await service.plugPostCap.record('org', 'x');
      expect(redis.incr).toHaveBeenCalledTimes(1);
      expect(redis.expire).toHaveBeenCalledWith(
        redis.incr.mock.calls[0][0],
        62 * 24 * 60 * 60
      );
      // a channel without a cap is not counted
      redis.incr.mockClear();
      await service.plugPostCap.record('org', 'bluesky');
      expect(redis.incr).not.toHaveBeenCalled();
    });
  });
});
