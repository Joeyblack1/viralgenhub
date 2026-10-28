import {
  adminPlanLabel,
  planDisplayName,
  planPostsLimitError,
  pricing,
} from './pricing';

describe('planPostsLimitError, monthly X posts per plan', () => {
  it('caps X at 0 on Free, 20 on Creator and 60 on Business', () => {
    expect(pricing.FREE.x_posts_per_month).toBe(0);
    expect(pricing.STANDARD.x_posts_per_month).toBe(20);
    expect(pricing.TEAM.x_posts_per_month).toBe(60);
  });
  it('sends Free to the plans that include X', () => {
    expect(planPostsLimitError('FREE', 'x_posts_per_month', 'X', 0, 1)).toBe(
      'X is available on the Creator and Business plans.'
    );
  });
  it('lets a paid plan fill its cap exactly', () => {
    expect(
      planPostsLimitError('STANDARD', 'x_posts_per_month', 'X', 19, 1)
    ).toBeUndefined();
    expect(
      planPostsLimitError('TEAM', 'x_posts_per_month', 'X', 0, 60)
    ).toBeUndefined();
  });
  it('refuses the post that would go over the cap', () => {
    expect(
      planPostsLimitError('STANDARD', 'x_posts_per_month', 'X', 20, 1)
    ).toBe('Your plan includes 20 X posts a month and this would go over it.');
    expect(planPostsLimitError('TEAM', 'x_posts_per_month', 'X', 58, 3)).toBe(
      'Your plan includes 60 X posts a month and this would go over it.'
    );
  });
});

describe('Free plan taste of the paid features (2026-10-18)', () => {
  it('gives Free the Public API with 100 requests a day and 1 webhook', () => {
    expect(pricing.FREE.public_api).toBe(true);
    expect(pricing.FREE.public_api_daily_limit).toBe(100);
    expect(pricing.FREE.webhooks).toBe(1);
  });
  it('keeps the paid plans uncapped and their webhooks as they were', () => {
    for (const tier of ['STANDARD', 'TEAM', 'PRO', 'ULTIMATE']) {
      expect(pricing[tier].public_api).toBe(true);
      expect(pricing[tier].public_api_daily_limit).toBe(0);
    }
    expect(pricing.STANDARD.webhooks).toBe(2);
    expect(pricing.TEAM.webhooks).toBe(10);
  });
  it('keeps the rest paid-only', () => {
    expect(pricing.FREE.channel).toBe(2);
    expect(pricing.FREE.posts_per_month).toBe(20);
    expect(pricing.FREE.team_members).toBe(false);
    expect(pricing.FREE.autoPost).toBe(false);
    expect(pricing.FREE.x_posts_per_month).toBe(0);
    expect(pricing.FREE.ai).toBe(false);
  });
});

describe('plan names shown to customers and to admins', () => {
  it('uses our plan names, never the upstream tier keys', () => {
    expect(planDisplayName('STANDARD')).toBe('Creator');
    expect(planDisplayName('TEAM')).toBe('Business');
    expect(planDisplayName('free')).toBe('Free');
  });
  it('labels admin choices with the stored key and flags unsold tiers', () => {
    expect(adminPlanLabel('STANDARD')).toBe('Creator (STANDARD)');
    expect(adminPlanLabel('TEAM')).toBe('Business (TEAM)');
    expect(adminPlanLabel('')).toBe('Free (FREE)');
    expect(adminPlanLabel('PRO')).toBe('Pro (PRO, not sold)');
    expect(adminPlanLabel('ULTIMATE')).toBe('Ultimate (ULTIMATE, not sold)');
  });
});
