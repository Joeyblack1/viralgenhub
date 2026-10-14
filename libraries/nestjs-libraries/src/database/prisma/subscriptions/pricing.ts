export interface PricingInnerInterface {
  current: string;
  month_price: number;
  year_price: number;
  channel?: number;
  posts_per_month: number;
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
  webhooks: number;
  autoPost: boolean;
}
export interface PricingInterface {
  [key: string]: PricingInnerInterface;
}
// ViralGenHub plans (Joseph, 2026-10-14). Prices are in STRIPE_CURRENCY (gbp).
//   FREE      = Free      2 channels, 20 posts/month
//   STANDARD  = Creator   £7/month, £67.20/year (20% off)
//   TEAM      = Business  £19/month, £182.40/year (20% off), team members
// PRO and ULTIMATE are upstream tiers we do not sell. AI features are off in
// every plan: they need provider keys we have not configured.
export const pricing: PricingInterface = {
  FREE: {
    current: 'FREE',
    month_price: 0,
    year_price: 0,
    channel: 2,
    image_generation_count: 0,
    posts_per_month: 20,
    team_members: false,
    community_features: false,
    featured_by_gitroom: false,
    ai: false,
    import_from_channels: false,
    image_generator: false,
    public_api: false,
    webhooks: 0,
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
    image_generation_count: 0,
    team_members: false,
    ai: false,
    community_features: false,
    featured_by_gitroom: false,
    import_from_channels: true,
    image_generator: false,
    public_api: true,
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
    image_generation_count: 0,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: false,
    import_from_channels: true,
    image_generator: false,
    public_api: true,
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
    image_generation_count: 300,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
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
    image_generation_count: 500,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
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
