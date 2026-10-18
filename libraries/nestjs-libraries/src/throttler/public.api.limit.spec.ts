import {
  consumePublicApiQuota,
  publicApiLimitForOrg,
  publicApiLimitMessage,
  secondsUntilUtcMidnight,
} from './public.api.limit';

const fakeRedis = () => {
  const counts = new Map<string, number>();
  const expires: Record<string, number> = {};
  return {
    counts,
    expires,
    incr: async (k: string) => {
      counts.set(k, (counts.get(k) || 0) + 1);
      return counts.get(k)!;
    },
    expire: async (k: string, s: number) => {
      expires[k] = s;
      return 1;
    },
  };
};

const org = (tier?: string, id = 'org1') => ({
  id,
  subscription: tier ? { subscriptionTier: tier } : null,
});

describe('Public API / MCP daily limit', () => {
  it('has the exact message', () => {
    expect(publicApiLimitMessage(100)).toBe(
      'The Free plan includes 100 API requests a day. Upgrade for more.'
    );
  });

  it('reads the cap from the plan', () => {
    expect(publicApiLimitForOrg(org('FREE'))).toBe(100);
    expect(publicApiLimitForOrg(org('STANDARD'))).toBe(0);
    expect(publicApiLimitForOrg(org('TEAM'))).toBe(0);
    expect(publicApiLimitForOrg(org())).toBe(0);
  });

  it('allows a Free org up to 100 requests and refuses the 101st', async () => {
    const redis = fakeRedis();
    const now = new Date('2026-10-18T10:00:00Z');
    for (let i = 1; i <= 100; i++) {
      const q = await consumePublicApiQuota(redis, org('FREE'), now);
      expect(q.allowed).toBe(true);
    }
    const over = await consumePublicApiQuota(redis, org('FREE'), now);
    expect(over).toEqual({ allowed: false, limit: 100, used: 101 });
  });

  it('counts each org on its own and resets the next UTC day', async () => {
    const redis = fakeRedis();
    const day1 = new Date('2026-10-18T23:59:00Z');
    const day2 = new Date('2026-10-19T00:01:00Z');
    for (let i = 0; i < 101; i++) {
      await consumePublicApiQuota(redis, org('FREE', 'a'), day1);
    }
    expect((await consumePublicApiQuota(redis, org('FREE', 'a'), day1)).allowed).toBe(false);
    expect((await consumePublicApiQuota(redis, org('FREE', 'b'), day1)).allowed).toBe(true);
    expect((await consumePublicApiQuota(redis, org('FREE', 'a'), day2)).allowed).toBe(true);
  });

  it('sets an expiry on the first request of the day only', async () => {
    const redis = fakeRedis();
    await consumePublicApiQuota(redis, org('FREE'), new Date('2026-10-18T10:00:00Z'));
    expect(Object.values(redis.expires)).toEqual([90000]);
  });

  it('never limits paid plans or touches Redis for them', async () => {
    const redis = fakeRedis();
    for (const tier of ['STANDARD', 'TEAM', 'PRO', 'ULTIMATE']) {
      for (let i = 0; i < 150; i++) {
        expect((await consumePublicApiQuota(redis, org(tier))).allowed).toBe(true);
      }
    }
    expect(redis.counts.size).toBe(0);
  });

  it('fails open when Redis is down', async () => {
    const broken = {
      incr: async () => {
        throw new Error('down');
      },
      expire: async () => 1,
    };
    expect((await consumePublicApiQuota(broken, org('FREE'))).allowed).toBe(true);
  });

  it('tells the client when to retry', () => {
    expect(secondsUntilUtcMidnight(new Date('2026-10-18T23:00:00Z'))).toBe(3600);
  });
});
