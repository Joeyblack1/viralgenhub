// What a platform itself needs before an approved tester can connect, for the
// /admin/early-access page and the approval email. Checked against the
// platforms' own docs on 28 Oct 2026 (sources in the ops repo,
// docs/launch/preview-platforms.md). No platform offers an API to add a
// tester: Meta's /{app-id}/roles is read-only (Graph API v26.0), Google has
// none for test users, Pinterest collaborators go through Business Manager.
// So approval can only be automatic where the platform needs no step at all.

type Env = Record<string, string | undefined>;

export type PlatformStepKind = 'none' | 'manual' | 'limited';

export interface PlatformStep {
  // none: approving is enough; manual: the admin must add the person on the
  // platform first; limited: approving works, with a platform-side limit
  kind: PlatformStepKind;
  // for the admin page
  adminText: string;
  adminLink?: string;
  adminLinkLabel?: string;
  // added to the approval email (plain text; escaped by the caller)
  userText?: string;
}

const META = new Set([
  'facebook',
  'instagram',
  'instagram-standalone',
  'threads',
]);

export const platformStep = (
  provider: string,
  env: Env = process.env
): PlatformStep => {
  if (META.has(provider)) {
    const appId = (env.FACEBOOK_APP_ID || env.THREADS_APP_ID || '').trim();
    const threads = provider === 'threads';
    return {
      kind: 'manual',
      adminText: threads
        ? 'Meta app in development: add the person under App roles > Roles > "Threads Testers" (by Threads username). Meta allows testers only if they are staff or have a tester agreement with us, max 50 people across all roles.'
        : 'Meta app in development: add the person under App roles > Roles > Testers (Facebook name or profile). Meta allows testers only if they are staff or have a tester agreement with us, max 50 people across all roles. Needs Business Verification + App Review to open to everyone.',
      adminLink: appId
        ? `https://developers.facebook.com/apps/${encodeURIComponent(
            appId
          )}/roles/roles/`
        : 'https://developers.facebook.com/apps/',
      adminLinkLabel: 'Open Meta app roles',
      userText: threads
        ? 'Before you connect: accept the tester invite in Threads (Settings > Account > Website permissions > Invites).'
        : 'Before you connect: accept the tester invite on Facebook (Settings > Apps and websites > Requests).',
    };
  }
  switch (provider) {
    case 'youtube':
      return {
        kind: 'limited',
        adminText:
          'Google project is "In production" but unverified: anyone can connect after an "unverified app" warning, and only 100 new Google accounts ever (lifetime cap, cannot be reset). No test-user list to fill.',
        adminLink:
          'https://console.cloud.google.com/auth/audience',
        adminLinkLabel: 'Open Google audience',
        userText:
          'Google will show an "unverified app" screen while our verification is pending: choose Advanced, then continue to ViralGenHub.',
      };
    case 'pinterest':
      return {
        kind: 'limited',
        adminText:
          'Pinterest Trial access: pins and boards made through the API are visible only to their creator (sandbox). Do not approve customers until Standard access.',
        adminLink: 'https://developers.pinterest.com/apps/',
        adminLinkLabel: 'Open Pinterest apps',
      };
    case 'linkedin-page':
      return {
        kind: 'limited',
        adminText:
          'LinkedIn Community Management Development tier: no tester list, but 500 calls per app per day and 100 per member per day.',
        adminLink: 'https://www.linkedin.com/developers/apps',
        adminLinkLabel: 'Open LinkedIn apps',
      };
    case 'hashnode':
      return {
        kind: 'limited',
        adminText:
          'No app review. Every Hashnode API call needs a Pro plan on the user\'s own publication (Hashnode, May 2026).',
        userText:
          'Hashnode only allows API posting for publications on its Pro plan.',
      };
    case 'whop':
    case 'mastodon-custom':
    case 'skool':
      return {
        kind: 'none',
        adminText: 'No platform-side step: approving is enough.',
      };
    default:
      return {
        kind: 'none',
        adminText: 'No platform-side step known.',
      };
  }
};

// Providers whose tester requests are approved as soon as they arrive
// (EARLY_ACCESS_AUTO_APPROVE, comma separated). A provider that needs a
// manual platform step is never auto-approved, whatever the list says: the
// person could not connect until the admin had added them.
export const autoApproves = (provider: string, env: Env = process.env) =>
  (env.EARLY_ACCESS_AUTO_APPROVE || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .includes(provider) && platformStep(provider, env).kind !== 'manual';
