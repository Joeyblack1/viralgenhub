import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import dayjs from 'dayjs';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  getPublicKey,
  Relay,
  finalizeEvent,
  SimplePool,
  nip19,
  VerifiedEvent,
} from 'nostr-tools';

import WebSocket from 'ws';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Integration } from '@prisma/client';

// @ts-ignore
global.WebSocket = WebSocket;

const list = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://temp.iris.to',
  'wss://vault.iris.to',
];

const pool = new SimplePool();

export class NostrProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5;
  identifier = 'nostr';
  name = 'Nostr';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  toolTip =
    'Paste your Nostr private key, as nsec1... or as hex, you can export it from apps like iris.to';

  maxLength() {
    return 100000;
  }

  async customFields() {
    return [
      {
        key: 'password',
        label: 'Nostr private key',
        validation: `/^.{3,}$/`,
        type: 'password' as const,
      },
    ];
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeSecureId(17);
    return {
      url: state,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  // The key as the user pasted it (stored that way): nsec1... (NIP-19) or
  // 64 hex characters. Errors never carry the key, the bech32 decoder's own
  // messages quote the whole string.
  private secretKey(password: string) {
    const key = (password || '').trim();
    if (key.startsWith('nsec1')) {
      try {
        const { type, data } = nip19.decode(key);
        if (type === 'nsec') {
          return data;
        }
      } catch (err) {
        /**empty - reported below**/
      }
      throw new Error('Invalid Nostr private key');
    }

    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error('Invalid Nostr private key');
    }

    return Uint8Array.from(
      (key.match(/.{1,2}/g) || []).map((byte: any) => parseInt(byte, 16))
    );
  }

  private async findRelayInformation(pubkey: string) {
    // This queries ALL relays in parallel and resolves with
    // the first matching event from ANY relay.
    const evt = await pool.get(list, {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });

    if (!evt) return {};

    let content: any = {};
    try {
      content = JSON.parse(evt.content || '{}');
    } catch {
      return {};
    }

    if (content.name || content.displayName || content.display_name) {
      return content;
    }

    return {};
  }

  // Sends the signed event to every relay and returns its own id: the note
  // is the event we signed, whichever relays stored it. relay.publish only
  // resolves on the relay's OK, so a relay that is down, times out or rejects
  // the event does not count, and the post fails when none accepted it.
  private async publish(event: VerifiedEvent) {
    const results = await Promise.allSettled(
      list.map(async (url) => {
        const relay = new Relay(url);
        try {
          await relay.connect({ timeout: 6000 });
          await relay.publish(event);
        } finally {
          const connected = relay.connected;
          relay.close();
          // close() only shuts an OPEN socket: after a connect timeout it is
          // still CONNECTING and would stay open once the handshake ends.
          // terminate() is the ws socket's (global.WebSocket is ws, above).
          if (!connected) {
            (relay as any).ws?.terminate?.();
          }
        }
      })
    );

    if (!results.some((result) => result.status === 'fulfilled')) {
      throw new BadBody(
        this.identifier,
        JSON.stringify(
          results.map(
            (result, index) =>
              `${list[index]}: ${
                result.status === 'rejected' ? String(result.reason) : 'ok'
              }`
          )
        ),
        JSON.stringify({ id: event.id }),
        'None of the Nostr relays accepted the post, please try again'
      );
    }

    return event.id;
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    try {
      const body = JSON.parse(Buffer.from(params.code, 'base64').toString());

      const pubkey = getPublicKey(this.secretKey(body.password));

      const user = await this.findRelayInformation(pubkey);

      return {
        id: pubkey,
        name: user.display_name || user.displayName || user.name || 'No Name',
        accessToken: AuthService.signJWT({ password: body.password }),
        refreshToken: '',
        expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
        picture: user?.picture || '',
        username: user.name || 'nousername',
      };
    } catch (e) {
      // not logged: the error can quote the key that was pasted
      return 'Invalid credentials';
    }
  }

  private buildContent(post: PostDetails): string {
    const mediaContent = post.media?.map((m) => m.path).join('\n\n') || '';
    return mediaContent
      ? `${post.message}\n\n${mediaContent}`
      : post.message;
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const { password } = AuthService.verifyJWT(accessToken) as any;
    const [firstPost] = postDetails;

    const textEvent = finalizeEvent(
      {
        kind: 1, // Text note
        content: this.buildContent(firstPost),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      },
      this.secretKey(password)
    );

    const eventId = await this.publish(textEvent);

    return [
      {
        id: firstPost.id,
        postId: String(eventId),
        releaseURL: `https://primal.net/e/${eventId}`,
        status: 'completed',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { password } = AuthService.verifyJWT(accessToken) as any;
    const [commentPost] = postDetails;
    const replyToId = lastCommentId || postId;

    const textEvent = finalizeEvent(
      {
        kind: 1, // Text note
        content: this.buildContent(commentPost),
        tags: [
          ['e', replyToId, '', 'reply'],
          ['p', id],
        ],
        created_at: Math.floor(Date.now() / 1000),
      },
      this.secretKey(password)
    );

    const eventId = await this.publish(textEvent);

    return [
      {
        id: commentPost.id,
        postId: String(eventId),
        releaseURL: `https://primal.net/e/${eventId}`,
        status: 'completed',
      },
    ];
  }
}
