// ViralGenHub: the "What's new" list behind the Help menu.
//
// Rules: newest first; only features that are live for customers (nothing
// "coming soon", nothing in preview); short and factual, the same wording as
// viralgenhub.com/changelog. The id is the release date (YYYY-MM-DD, with an
// optional letter for a second release that day) and is what the server stores
// as the newest entry a person has seen (User.whatsNewSeen).

export const CHANGELOG_URL = 'https://viralgenhub.com/changelog';

export interface WhatsNewEntry {
  id: string;
  date: string;
  items: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-10-28',
    date: '28 Oct 2026',
    items: [
      'Retry one channel: when a post fails on one platform, hover it in the calendar and choose Retry. Only that channel is sent again.',
      'Deleting your account now also deletes your workspaces’ posts, media, comments and channels for good, 30 days later.',
    ],
  },
  {
    id: '2026-10-27',
    date: '27 Oct 2026',
    items: [
      'What’s new: this list, with a dot on the Help menu when something changes.',
      'Clearer team roles: each workspace has an Owner, Admins and Members.',
      'Features from paid plans are shown with a lock and the plan that includes them, so you can see what each plan adds.',
      'Help menu in the header: FAQ, connecting your accounts, support e-mail and our Telegram channel.',
      'TikTok: new posts go to your TikTok inbox as a draft that you publish, publicly if you like, in the TikTok app. Direct posts stay private (Only me) until TikTok\u2019s audit is done.',
      'Bluesky: when Bluesky won\u2019t take a video (for example, the account\u2019s email is not confirmed yet), the post now says why and how to fix it.',
    ],
  },
  {
    id: '2026-10-24',
    date: '24 Oct 2026',
    items: [
      'Paid plans are live: Creator at £7.99 a month (£79.90 a year) and Business at £19.99 a month (£199.90 a year), with payments taken by Stripe.',
      'Billing page in the app: choose or change your plan, and cancel.',
      'Security release before the first payments.',
    ],
  },
  {
    id: '2026-10-22',
    date: '22 Oct 2026',
    items: [
      'TikTok approved ViralGenHub: anyone can connect a TikTok channel. Posts are private (Only me) until TikTok\u2019s Direct Post audit is done.',
      'Bluesky, Discord, Slack and Telegram switched on.',
    ],
  },
];

export const WHATS_NEW_ID_PATTERN = /^\d{4}-\d{2}-\d{2}[a-z]?$/;

export const latestWhatsNewId = (list: WhatsNewEntry[] = WHATS_NEW) =>
  list[0]?.id || '';

export const isKnownWhatsNewId = (
  id: unknown,
  list: WhatsNewEntry[] = WHATS_NEW
): id is string =>
  typeof id === 'string' && list.some((entry) => entry.id === id);

// Entries newer than the one the person last saw. Someone who has never
// opened the list sees only the newest entry as new (a new account should not
// open on a pile of old news). Ids sort as strings because they are ISO dates.
export const unseenWhatsNew = (
  seenId?: string | null,
  list: WhatsNewEntry[] = WHATS_NEW
): WhatsNewEntry[] => {
  if (!seenId) {
    return list.slice(0, 1);
  }
  return list.filter((entry) => entry.id > seenId);
};

export const hasUnseenWhatsNew = (
  seenId?: string | null,
  list: WhatsNewEntry[] = WHATS_NEW
) => unseenWhatsNew(seenId, list).length > 0;
