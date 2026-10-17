import 'reflect-metadata';
import { HttpException } from '@nestjs/common';

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({})),
  DallEAPIWrapper: jest.fn().mockImplementation(() => ({})),
}));

// the service only needs the shape of its dependencies
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({
    PostsService: class {},
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));

import { AutopostService } from './autopost.service';

const integration = (id: string, providerIdentifier: string) =>
  ({ id, providerIdentifier, organizationId: 'org' } as any);

const run = async (checkPlanPostsLimits: jest.Mock) => {
  const posts = {
    findFreeDateTime: jest.fn().mockResolvedValue('2026-11-05T10:00:00'),
    checkPlanPostsLimits,
    createPost: jest.fn().mockResolvedValue([]),
  };
  const service = new AutopostService(
    {} as any,
    {} as any,
    {} as any,
    posts as any
  );
  await service.schedulePost({
    integrations: [integration('i1', 'x'), integration('i2', 'bluesky')],
    description: 'hello',
    image: '',
    load: { url: 'https://example.com/a' },
  } as any);
  return posts;
};

describe('AutopostService.schedulePost, monthly X cap', () => {
  it('skips the X channel over its cap and keeps the others', async () => {
    const posts = await run(
      jest.fn().mockImplementation(async (_org, [body]) => {
        if (body.posts[0].settings.__type === 'x') {
          throw new HttpException('over', 402);
        }
      })
    );
    const [, body] = posts.createPost.mock.calls[0];
    expect(body.posts.map((p: any) => p.integration.id)).toEqual(['i2']);
  });

  it('creates nothing, and does not throw, when every channel is over', async () => {
    const posts = await run(
      jest.fn().mockRejectedValue(new HttpException('over', 402))
    );
    expect(posts.createPost).not.toHaveBeenCalled();
  });

  it('rethrows errors that are not a plan limit', async () => {
    await expect(
      run(jest.fn().mockRejectedValue(new Error('db down')))
    ).rejects.toThrow('db down');
  });
});
