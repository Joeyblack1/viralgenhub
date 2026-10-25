// ViralGenHub: example placeholder text for the Add Channel custom fields.
// Kept in its own file so provider files and upstream code stay untouched.
// Key = `${providerIdentifier}.${fieldKey}`. Shown as grey HTML placeholder text only.
export const customFieldPlaceholders: Record<string, string> = {
  'bluesky.service': 'https://bsky.social',
  'bluesky.identifier': 'yourname.bsky.social',
  'bluesky.password': 'App password, like xxxx-xxxx-xxxx-xxxx',
  'lemmy.service': 'https://lemmy.world',
  'lemmy.identifier': 'your Lemmy username or email',
  'lemmy.password': 'your Lemmy password',
  'lemmy.totp': '6-digit code, only if 2-factor is on',
  'wordpress.domain': 'https://yourblog.com',
  'wordpress.username':
    'the WordPress username that owns the application password',
  'wordpress.password': 'xxxx xxxx xxxx xxxx xxxx xxxx (Application Password)',
  'listmonk.url': 'https://lists.yoursite.com',
  'listmonk.username': 'your Listmonk admin username',
  'listmonk.password': 'your Listmonk admin password',
  'mastodon-custom.url': 'https://mastodon.social',
  'nostr.password': 'nsec1... (your Nostr private key)',
  'devto.apiKey': 'API key from dev.to/settings/extensions',
  'hashnode.apiKey':
    'Personal access token from hashnode.com/settings/developer',
  'medium.apiKey': 'Integration token from medium.com/me/settings/security',
};

export const getCustomFieldPlaceholder = (
  identifier: string,
  key: string,
  fromBackend?: string
) => fromBackend || customFieldPlaceholders[`${identifier}.${key}`];
