// nostr-tools pulls in ESM-only @noble packages that this jest setup does not
// transform, so the library is replaced whole: signing is faked, and what is
// under test is which id publish() reports and when it fails.
const mockRelayAnswers: Record<string, string> = {};
const mockPublished: Array<{ url: string; id: string }> = [];
const mockKey = new Uint8Array(32).fill(7);

// bcrypt's native binding is not what is under test
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));

jest.mock('nostr-tools', () => ({
  getPublicKey: () => 'pubkey',
  SimplePool: class {},
  finalizeEvent: (template: any) => ({
    ...template,
    id: 'id-of-the-signed-event',
    pubkey: 'pubkey',
    sig: 'sig',
  }),
  nip19: {
    decode: (value: string) => {
      if (value === 'nsec1valid') {
        return { type: 'nsec', data: mockKey };
      }
      if (value === 'nsec1npub') {
        return { type: 'npub', data: 'pubkey' };
      }
      throw new Error(`Invalid checksum in ${value}`);
    },
  },
  // 'ok' answers OK true; 'down' fails the connect; anything else rejects
  // the publish like a relay answering OK false.
  Relay: class {
    constructor(public url: string) {}
    async connect() {
      if (mockRelayAnswers[this.url] === 'down') {
        throw new Error('connection timed out');
      }
    }
    async publish(event: { id: string }) {
      mockPublished.push({ url: this.url, id: event.id });
      if (mockRelayAnswers[this.url] !== 'ok') {
        throw new Error('blocked: not allowed');
      }
      return '';
    }
    close() {
      /**empty**/
    }
  },
}));

import { NostrProvider } from './nostr.provider';
import { BadBody } from '../social.abstract';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

const relays = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://temp.iris.to',
  'wss://vault.iris.to',
];

describe('NostrProvider', () => {
  const provider = new NostrProvider();
  const hex = '07'.repeat(32);

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  beforeEach(() => {
    mockPublished.length = 0;
    for (const url of relays) {
      mockRelayAnswers[url] = 'down';
    }
  });

  const post = () =>
    provider.post('pubkey', AuthService.signJWT({ password: hex }), [
      { id: 'post-1', message: 'Hello Nostr', settings: {} } as any,
    ]);

  it('returns the id of the event it signed once a relay accepts it', async () => {
    mockRelayAnswers['wss://relay.damus.io'] = 'rejected';
    mockRelayAnswers['wss://relay.snort.social'] = 'ok';

    const [result] = await post();

    expect(mockPublished.map((p) => p.url)).toEqual([
      'wss://relay.damus.io',
      'wss://relay.snort.social',
    ]);
    expect(result.postId).toBe('id-of-the-signed-event');
    expect(result.releaseURL).toBe(
      'https://primal.net/e/id-of-the-signed-event'
    );
  });

  it('fails the post when no relay accepted it', async () => {
    mockRelayAnswers['wss://nos.lol'] = 'rejected';

    const err = await post().catch((e) => e);
    expect(err).toBeInstanceOf(BadBody);
    expect(err.message).toBe(
      'None of the Nostr relays accepted the post, please try again'
    );
  });

  it('reports the signed id for a comment too', async () => {
    mockRelayAnswers['wss://nos.lol'] = 'ok';

    const [result] = await provider.comment(
      'pubkey',
      'parent-id',
      undefined,
      AuthService.signJWT({ password: hex }),
      [{ id: 'comment-1', message: 'Reply', settings: {} } as any],
      {} as any
    );

    expect(result.postId).toBe('id-of-the-signed-event');
  });

  it('accepts the key as nsec or hex, and rejects anything else', () => {
    const secretKey = (key: string) => (provider as any).secretKey(key);

    expect(secretKey('nsec1valid')).toBe(mockKey);
    expect(Array.from(secretKey(` ${hex.toUpperCase()}\n`))).toEqual(
      Array.from(mockKey)
    );
    for (const bad of ['nsec1broken', 'nsec1npub', 'zz'.repeat(32), 'abc']) {
      expect(() => secretKey(bad)).toThrow('Invalid Nostr private key');
    }
  });

  it('never puts the pasted key in the error', () => {
    const err = (() => {
      try {
        (provider as any).secretKey('nsec1broken');
      } catch (e: any) {
        return e;
      }
    })();
    expect(err.message).not.toContain('nsec1broken');
  });
});
