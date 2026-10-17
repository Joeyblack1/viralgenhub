// #148: the post the editor loads (GET /posts/:id, /posts/group/:group) carries
// its channel without the platform tokens. Mocked repository, nothing connects.
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/media/media.service', () => ({
  MediaService: class {},
}));
jest.mock('sharp', () => jest.fn());
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class {},
}));
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social.abstract',
  () => ({ RefreshToken: class {} })
);

import { PostsService } from './posts.service';

const post = (extra: any = {}) => ({
  id: 'p1',
  group: 'g1',
  content: 'hello',
  image: '[]',
  settings: '{}',
  integrationId: 'i1',
  parentPostId: null,
  childrenPost: [],
  integration: {
    id: 'i1',
    name: 'Chan',
    picture: 'p.png',
    providerIdentifier: 'x',
    profile: 'me',
    token: 'platform-access-token',
    refreshToken: 'platform-refresh-token',
    customInstanceDetails: 'details',
  },
  ...extra,
});

const build = (repo: any) => {
  const service = new PostsService(
    repo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );
  // media rewriting is not under test
  (service as any).updateMedia = jest.fn(async () => []);
  return service;
};

describe('PostsService editor responses (#148)', () => {
  it('getPost returns the channel without token / refreshToken', async () => {
    const repo: any = { getPost: jest.fn(async () => post()) };
    const res: any = await build(repo).getPost('org', 'p1');
    const json = JSON.stringify(res);
    expect(json).not.toContain('platform-access-token');
    expect(json).not.toContain('platform-refresh-token');
    expect(json).not.toContain('"token"');
    expect(json).not.toContain('refreshToken');
    expect(json).not.toContain('customInstanceDetails');
    expect(res.posts[0].integration.name).toBe('Chan');
    // the repository call that internal callers use still holds the tokens
    expect((await repo.getPost()).integration.token).toBe('platform-access-token');
  });

  it('getPostsByGroup (and its siblings) carry no tokens', async () => {
    const sibling = post({
      id: 'p2',
      group: 'g2',
      integrationId: 'i2',
      batchId: 'b1',
      integration: { ...post().integration, id: 'i2' },
    });
    const repo: any = {
      getPostsByGroup: jest.fn(async () => [post({ batchId: 'b1' })]),
      getPostsByBatch: jest.fn(async () => [sibling]),
    };
    const res: any = await build(repo).getPostsByGroup('org', 'g1');
    expect(res.siblings).toHaveLength(1);
    const json = JSON.stringify(res);
    expect(json).not.toContain('platform-');
    expect(json).not.toContain('refreshToken');
    expect(json).not.toContain('customInstanceDetails');
  });
});
