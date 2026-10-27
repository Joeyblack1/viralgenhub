import 'reflect-metadata';

jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

import { AccountPurgeRepository } from './account-purge.repository';

// Records every Prisma call the purge makes inside its transaction, so the
// test can check the order (children before parents) and that every write
// is scoped to the one workspace being purged.
const recordingTx = () => {
  const calls: Array<{ model: string; op: string; args: any }> = [];
  const results: Record<string, any> = {
    'post.findMany': [{ id: 'p1' }, { id: 'p2' }],
    'integration.findMany': [{ id: 'i1' }],
    'webhooks.findMany': [{ id: 'w1' }],
    'media.findMany': [
      { id: 'm1', path: 'https://app.test/uploads/a.png', thumbnail: null },
      {
        id: 'm2',
        path: 'https://app.test/uploads/b.mp4',
        thumbnail: 'https://app.test/uploads/b.jpg',
      },
    ],
  };
  const tx = new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get: (_m, op: string) => async (args: any) => {
              calls.push({ model, op, args });
              const key = `${model}.${op}`;
              if (key in results) return results[key];
              if (op === 'deleteMany' || op === 'updateMany') {
                return { count: 1 };
              }
              return {};
            },
          }
        ),
    }
  );
  const prisma = {
    $transaction: jest.fn(async (fn: any, options: any) => fn(tx)),
  };
  return { prisma, calls };
};

const NOW = new Date('2026-11-26T12:00:00Z');

describe('AccountPurgeRepository.purgeOrganization', () => {
  it('deletes the workspace content children-first, in one transaction', async () => {
    const { prisma, calls } = recordingTx();
    const repo = new AccountPurgeRepository(prisma as any);

    const result = await repo.purgeOrganization('org1', NOW);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const order = calls
      .filter((c) => c.op === 'deleteMany')
      .map((c) => c.model);
    const before = (a: string, b: string) =>
      expect(order.indexOf(a)).toBeLessThan(order.indexOf(b));
    before('comments', 'post');
    before('tagsPosts', 'post');
    before('errors', 'post');
    before('post', 'integration');
    before('plugs', 'integration');
    before('exisingPlugData', 'integration');
    before('integrationsWebhooks', 'integration');
    before('integrationsWebhooks', 'webhooks');
    before('tagsPosts', 'tags');
    for (const model of [
      'comments',
      'post',
      'media',
      'integration',
      'signatures',
      'sets',
      'autoPost',
      'notifications',
      'thirdParty',
    ]) {
      expect(order).toContain(model);
    }

    expect(result.files).toEqual([
      'https://app.test/uploads/a.png',
      'https://app.test/uploads/b.mp4',
      'https://app.test/uploads/b.jpg',
    ]);
    expect(result.counts.posts).toBe(1);

    // the workspace row is kept for billing, marked purged and anonymised
    const update = calls.find(
      (c) => c.model === 'organization' && c.op === 'update'
    )!;
    expect(update.args.where).toEqual({ id: 'org1' });
    expect(update.args.data).toMatchObject({
      purgedAt: NOW,
      name: 'Deleted workspace',
      apiKey: null,
    });
  });

  it('scopes every write to the purged workspace or rows read from it', async () => {
    const { prisma, calls } = recordingTx();
    const repo = new AccountPurgeRepository(prisma as any);
    await repo.purgeOrganization('org1', NOW);

    const own = new Set(['org1', 'p1', 'p2', 'i1', 'w1', 'm1', 'm2']);
    const scoped = (where: any): boolean => {
      if (where === null || typeof where !== 'object') {
        return false;
      }
      const values = JSON.stringify(where).match(/"[^"]*"/g) || [];
      const ids = values
        .map((v) => v.slice(1, -1))
        .filter((v) => own.has(v));
      return ids.length > 0;
    };

    for (const call of calls) {
      if (['deleteMany', 'updateMany', 'update', 'findMany'].includes(call.op)) {
        expect({ call, scoped: scoped(call.args?.where) }).toMatchObject({
          scoped: true,
        });
      }
    }

    // every OR branch is scoped too: no branch can match another workspace
    for (const call of calls) {
      for (const branch of call.args?.where?.OR || []) {
        expect({ model: call.model, branch, scoped: scoped(branch) }).toMatchObject({
          scoped: true,
        });
      }
    }

    // media: only rows no avatar, agency logo or OAuth app uses
    const media = calls.find((c) => c.model === 'media' && c.op === 'findMany')!;
    expect(media.args.where).toMatchObject({
      organizationId: 'org1',
      userPicture: { none: {} },
      agencies: { none: {} },
      oauthApps: { none: {} },
    });
  });
});

describe('AccountPurgeRepository.findDue', () => {
  it('selects only marked, soft-deleted, not yet purged workspaces whose date has passed', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repo = new AccountPurgeRepository({
      organization: { findMany },
    } as any);
    await repo.findDue(NOW);
    expect(findMany.mock.calls[0][0].where).toEqual({
      purgeAfter: { lte: NOW },
      purgedAt: null,
      deletedAt: { not: null },
    });
  });
});
