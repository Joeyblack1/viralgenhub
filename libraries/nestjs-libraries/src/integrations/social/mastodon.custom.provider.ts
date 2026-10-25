import {
  ClientInformation,
  PostDetails,
  PostResponse,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { MastodonProvider } from '@gitroom/nestjs-libraries/integrations/social/mastodon.provider';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { normalizeBaseUrl } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';

export class MastodonCustomProvider extends MastodonProvider {
  override identifier = 'mastodon-custom';
  // any instance; the user enters its address. Named apart from 'mastodon'
  // (the MASTODON_URL server) so Add Channel does not list two "Mastodon"s.
  override name = 'Mastodon (other server)';
  override maxConcurrentJob = 5; // Custom Mastodon instances typically have generous limits
  editor = 'normal' as const;

  // Registers an app on the user's instance for every connect (Mastodon has
  // no global client): the controller keeps the result with the state and
  // saves it on the channel, so post() reaches the same instance.
  async externalUrl(url: string) {
    const form = new FormData();
    form.append('client_name', 'ViralGenHub');
    form.append('redirect_uris', this.redirectUri(process.env.FRONTEND_URL!));
    form.append('scopes', this.scopes.join(' '));
    form.append('website', process.env.FRONTEND_URL!);
    const { client_id, client_secret } = await (
      await fetch(normalizeBaseUrl(url) + '/api/v1/apps', {
        method: 'POST',
        body: form,
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      })
    ).json();

    // Not a Mastodon API, or the instance refused the app: fail the connect
    // here instead of sending the user to an authorize page with no client.
    if (!client_id || !client_secret) {
      throw new Error('Could not register the app on this Mastodon instance');
    }

    return {
      client_id,
      client_secret,
    };
  }

  // The controller passes the externalUrl result (plus instanceUrl) as the
  // first argument, see IAuthenticator.generateAuthUrl.
  override async generateAuthUrl(external?: ClientInformation) {
    const state = makeSecureId(6);
    const url = this.generateUrlDynamic(
      normalizeBaseUrl(external?.instanceUrl || ''),
      state,
      external?.client_id!,
      process.env.FRONTEND_URL!
    );

    return {
      url,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  override async authenticate(
    params: {
      code: string;
      codeVerifier: string;
      refresh?: string;
    },
    clientInformation?: ClientInformation
  ) {
    const instanceUrl = normalizeBaseUrl(clientInformation?.instanceUrl || '');
    const auth = await this.dynamicAuthenticate(
      clientInformation?.client_id!,
      clientInformation?.client_secret!,
      instanceUrl,
      params.code
    );

    // Account ids are only unique within one instance (small instances count
    // from 1), so the channel id carries the instance host.
    return { ...auth, id: `${new URL(instanceUrl).host}_${auth.id}` };
  }

  // The user's instance URL, saved encrypted at connection time. Falls back to
  // the default instance for legacy integrations that predate storing it.
  private instanceUrl(integration?: Integration) {
    try {
      const { instanceUrl } = JSON.parse(
        AuthService.fixedDecryption(integration?.customInstanceDetails || '')
      );
      return normalizeBaseUrl(
        instanceUrl || process.env.MASTODON_URL || 'https://mastodon.social'
      );
    } catch (err) {
      return normalizeBaseUrl(
        process.env.MASTODON_URL || 'https://mastodon.social'
      );
    }
  }

  override async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return this.dynamicPost(
      id,
      accessToken,
      this.instanceUrl(integration),
      postDetails
    );
  }

  // checkPostStatus / finalizePost are inherited as-is: the instance url
  // travels inside pendingData, set here once.
  override async postPending(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return this.dynamicPostPending(
      id,
      accessToken,
      this.instanceUrl(integration),
      postDetails
    );
  }

  override async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    return this.dynamicComment(
      id,
      postId,
      lastCommentId,
      accessToken,
      this.instanceUrl(integration),
      postDetails
    );
  }
}
