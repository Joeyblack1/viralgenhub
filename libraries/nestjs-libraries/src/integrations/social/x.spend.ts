import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// X bills every post made through its API: a flat price per post and a higher
// one for a post that contains a URL (USD).
export const X_POST_USD = 0.015;
export const X_LINK_POST_USD = 0.2;

export interface XSpendConfig {
  budgetUsd: number;
  pauseAtUsd: number;
}

export interface XSpend extends XSpendConfig {
  month: string;
  posts: number;
  linkPosts: number;
  estimatedUsd: number;
}

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(parsed)
    ? parsed
    : fallback;
};

export const getXSpendConfig = (
  env: Record<string, string | undefined> = process.env
): XSpendConfig => ({
  budgetUsd: num(env.X_MONTHLY_BUDGET_USD, 50),
  pauseAtUsd: num(env.X_PAUSE_AT_USD, 48),
});

const COMMON_TLDS =
  'com|net|org|io|co|uk|app|dev|ai|me|us|ca|au|de|fr|es|it|nl|eu|info|biz|xyz|tv|ly|gg|gl|link|site|online|store|shop|blog|news|live|page|so|sh|to|cc|ng|in|za';

const HTTP_URL = /https?:\/\/[^\s"'<>]+/i;
const BARE_DOMAIN = new RegExp(
  `(?:^|[\\s(\\[>])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${COMMON_TLDS})(?=$|[\\s/?#:),.!;<\\]])`,
  'i'
);

// Post content is stored as editor HTML. Anchors carry the URL in href, so the
// http(s) test runs on the raw content; the bare-domain test runs on the text.
export const containsUrl = (content: string) => {
  if (!content) {
    return false;
  }
  if (HTTP_URL.test(content)) {
    return true;
  }
  const text = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
  return BARE_DOMAIN.test(text);
};

export const estimateXSpend = (
  contents: string[],
  now: Date = new Date(),
  config: XSpendConfig = getXSpendConfig(),
  // with STRIP_LINKS_FROM_X_POSTS the links are removed before sending, so no
  // post is billed at the link price
  stripLinks = !!process.env.STRIP_LINKS_FROM_X_POSTS
): XSpend => {
  const posts = contents.length;
  const linkPosts = stripLinks ? 0 : contents.filter(containsUrl).length;
  const estimatedUsd =
    Math.round(
      ((posts - linkPosts) * X_POST_USD + linkPosts * X_LINK_POST_USD) * 100
    ) / 100;
  return {
    month: dayjs.utc(now).format('YYYY-MM'),
    posts,
    linkPosts,
    estimatedUsd,
    ...config,
  };
};

export const xSpendMonthRange = (now: Date = new Date()) => {
  const from = dayjs.utc(now).startOf('month');
  return { from: from.toDate(), to: from.add(1, 'month').toDate() };
};

export const xPausedMessage = (now: Date = new Date()) => {
  const next = dayjs.utc(now).add(1, 'month').startOf('month');
  return `ViralGenHub has paused X posting until next month (X API budget reached). Your post was not sent; reschedule it after ${next.format(
    'D MMMM YYYY'
  )}.`;
};

// The provider has no database access. The service that does registers itself
// here when the app boots (see AdminStatsService); with nothing registered the
// guard is off.
type XSpendSource = () => Promise<XSpend>;
let source: XSpendSource | undefined;
let cached: { at: number; value: XSpend } | undefined;

export const registerXSpendSource = (fn: XSpendSource | undefined) => {
  source = fn;
  cached = undefined;
};

// Resolves true when the month's estimate reached the pause line. The
// estimate is cached for a minute: every X post asks.
export const isXPostingPaused = async (now: Date = new Date()) => {
  if (!source) {
    return false;
  }
  if (!cached || now.getTime() - cached.at > 60_000) {
    try {
      cached = { at: now.getTime(), value: await source() };
    } catch (err) {
      // a failed estimate must not stop customers' posts
      return false;
    }
  }
  return cached.value.estimatedUsd >= cached.value.pauseAtUsd;
};
