import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

// Per-organisation daily cap on Public API (/public/v1) and MCP requests.
// The cap is the plan's `public_api_daily_limit` (0 = no cap, so paid plans
// are untouched). The counter lives in Redis, one key per org per UTC day.
// It sits next to the global ThrottlerModule (API_LIMIT, hourly, posts only)
// rather than inside it because that guard has a single limit for every org.

export const publicApiLimitMessage = (limit: number) =>
  `The Free plan includes ${limit} API requests a day. Upgrade for more.`;

interface CounterRedis {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export interface PublicApiQuota {
  allowed: boolean;
  limit: number;
  used: number;
}

// The tier of an organisation loaded with `subscription.subscriptionTier`.
// An org with no subscription row is not capped (self-hosted, no Stripe).
export const publicApiLimitForOrg = (org: {
  subscription?: { subscriptionTier?: string | null } | null;
}) => {
  const tier = org?.subscription?.subscriptionTier;
  return (tier && pricing[tier]?.public_api_daily_limit) || 0;
};

export const consumePublicApiQuota = async (
  redis: CounterRedis,
  org: {
    id: string;
    subscription?: { subscriptionTier?: string | null } | null;
  },
  now: Date = new Date()
): Promise<PublicApiQuota> => {
  const limit = publicApiLimitForOrg(org);
  if (!limit) {
    return { allowed: true, limit: 0, used: 0 };
  }

  try {
    const day = now.toISOString().slice(0, 10);
    const key = `public_api_daily:${org.id}:${day}`;
    const used = Number(await redis.incr(key));
    if (used === 1) {
      // a little over a day, so the key outlives the UTC day it counts
      await redis.expire(key, 90000);
    }
    return { allowed: used <= limit, limit, used };
  } catch (err) {
    // a Redis outage must not take the API down for Free users
    return { allowed: true, limit, used: 0 };
  }
};

export const secondsUntilUtcMidnight = (now: Date = new Date()) => {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
};
