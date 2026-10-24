export interface PricingInnerInterface {
  current: string;
  month_price: number;
  year_price: number;
  channel?: number;
  posts_per_month: number;
  // X bills every post through its API, so X posts are capped separately
  x_posts_per_month: number;
  team_members: boolean;
  community_features: boolean;
  featured_by_gitroom: boolean;
  ai: boolean;
  import_from_channels: boolean;
  image_generator?: boolean;
  image_generation_count: number;
  generate_videos: number;
  clipping_minutes: number;
  public_api: boolean;
  // Public API + MCP requests an organisation may make per UTC day; 0 = no cap
  public_api_daily_limit: number;
  webhooks: number;
  autoPost: boolean;
}
export interface PricingInterface {
  [key: string]: PricingInnerInterface;
}
// ViralGenHub plans (Joseph, 2026-10-14). Prices are in STRIPE_CURRENCY (gbp).
//   FREE      = Free      2 channels, 20 posts/month, no X, a taste of the
//                         Public API + MCP (100 requests a day), 1 webhook
//                         (Joseph, 2026-10-18)
//   STANDARD  = Creator   £7/month, £67.20/year (20% off), 100 X posts/month
//   TEAM      = Business  £19/month, £182.40/year (20% off), team members,
//                         300 X posts/month
// X posts are capped per calendar month of their publish date (Joseph,
// 2026-10-17): X's API is pay-per-use, about $0.015 a post, $0.20 with a URL.
// PRO and ULTIMATE are upstream tiers we do not sell. AI features (agent,
// post generator, image generator) are on for Business only; video generation
// and clipping stay off in every plan.
export const pricing: PricingInterface = {
  FREE: {
    current: 'FREE',
    month_price: 0,
    year_price: 0,
    channel: 2,
    image_generation_count: 0,
    posts_per_month: 20,
    x_posts_per_month: 0,
    team_members: false,
    community_features: false,
    featured_by_gitroom: false,
    ai: false,
    import_from_channels: false,
    image_generator: false,
    public_api: true,
    public_api_daily_limit: 100,
    webhooks: 1,
    autoPost: false,
    generate_videos: 0,
    clipping_minutes: 0,
  },
  STANDARD: {
    current: 'STANDARD',
    month_price: 7,
    year_price: 67.2,
    channel: 8,
    posts_per_month: 1000000,
    x_posts_per_month: 100,
    image_generation_count: 0,
    team_members: false,
    ai: false,
    community_features: false,
    featured_by_gitroom: false,
    import_from_channels: true,
    image_generator: false,
    public_api: true,
    public_api_daily_limit: 0,
    webhooks: 2,
    autoPost: false,
    generate_videos: 0,
    clipping_minutes: 0,
  },
  TEAM: {
    current: 'TEAM',
    month_price: 19,
    year_price: 182.4,
    channel: 25,
    posts_per_month: 1000000,
    x_posts_per_month: 300,
    image_generation_count: 100,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    public_api_daily_limit: 0,
    webhooks: 10,
    autoPost: true,
    generate_videos: 0,
    clipping_minutes: 0,
  },
  PRO: {
    current: 'PRO',
    month_price: 49,
    year_price: 470,
    channel: 30,
    posts_per_month: 1000000,
    x_posts_per_month: 300,
    image_generation_count: 300,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    public_api_daily_limit: 0,
    webhooks: 30,
    autoPost: true,
    generate_videos: 30,
    clipping_minutes: 300,
  },
  ULTIMATE: {
    current: 'ULTIMATE',
    month_price: 99,
    year_price: 950,
    channel: 100,
    posts_per_month: 1000000,
    x_posts_per_month: 300,
    image_generation_count: 500,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    public_api_daily_limit: 0,
    webhooks: 10000,
    autoPost: true,
    generate_videos: 60,
    clipping_minutes: 600,
  },
};

// ViralGenHub: display helpers shared by the billing screens.
export const CURRENCY_SYMBOL = '£';
const PLAN_NAMES: Record<string, string> = {
  FREE: 'Free',
  STANDARD: 'Creator',
  TEAM: 'Business',
  PRO: 'Pro',
  ULTIMATE: 'Ultimate',
};
export const planDisplayName = (tier: string) =>
  PLAN_NAMES[tier?.toUpperCase?.()] ||
  (tier ? tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase() : '');
// 7 -> "7", 67.2 -> "67.20"
export const formatPrice = (amount: number) =>
  Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
// Tiers shown on the billing pages. PRO and ULTIMATE stay in `pricing` for
// upstream compatibility but are not sold.
export const SOLD_TIERS = ['FREE', 'STANDARD', 'TEAM'];

// Plan fields that cap the posts of one platform a month. A provider opts in
// with `planPostsLimit` (X: x_posts_per_month).
export type PlanPostsLimit = 'x_posts_per_month';

// What the customer reads when `adding` more posts on `platform` would go over
// the plan's cap for that month (`used` posts are already in it), or undefined
// when they fit.
export const planPostsLimitError = (
  tier: string,
  limit: PlanPostsLimit,
  platform: string,
  used: number,
  adding: number
) => {
  const allowed = pricing[tier]?.[limit] || 0;
  if (used + adding <= allowed) {
    return undefined;
  }

  if (!allowed) {
    const plans = SOLD_TIERS.filter((t) => pricing[t][limit] > 0).map(
      planDisplayName
    );
    if (!plans.length) {
      return `${platform} is not available on your plan.`;
    }
    const names =
      plans.length === 1
        ? plans[0]
        : `${plans.slice(0, -1).join(', ')} and ${plans[plans.length - 1]}`;
    return `${platform} is available on the ${names} plan${
      plans.length === 1 ? '' : 's'
    }.`;
  }

  return `Your plan includes ${allowed} ${platform} posts a month and this would go over it.`;
};

// Free-trial length for paid plans. Upstream uses 7; ViralGenHub sets
// STRIPE_TRIAL_DAYS=0 (no trial; the Free plan is the try-before-you-buy).
export const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? 7);
export const TRIALS_ENABLED = TRIAL_DAYS > 0;
