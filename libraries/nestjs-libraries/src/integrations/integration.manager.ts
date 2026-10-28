import 'reflect-metadata';

import { Injectable } from '@nestjs/common';
import { XProvider } from '@gitroom/nestjs-libraries/integrations/social/x.provider';
import {
  providerHelperFunctions,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { LinkedinProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.provider';
import { RedditProvider } from '@gitroom/nestjs-libraries/integrations/social/reddit.provider';
import { DevToProvider } from '@gitroom/nestjs-libraries/integrations/social/dev.to.provider';
import { HashnodeProvider } from '@gitroom/nestjs-libraries/integrations/social/hashnode.provider';
import { MediumProvider } from '@gitroom/nestjs-libraries/integrations/social/medium.provider';
import { FacebookProvider } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';
import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';
import { YoutubeProvider } from '@gitroom/nestjs-libraries/integrations/social/youtube.provider';
import { TiktokProvider } from '@gitroom/nestjs-libraries/integrations/social/tiktok.provider';
import { TiktokBusinessProvider } from '@gitroom/nestjs-libraries/integrations/social/tiktok.business.provider';
import { PinterestProvider } from '@gitroom/nestjs-libraries/integrations/social/pinterest.provider';
import { DribbbleProvider } from '@gitroom/nestjs-libraries/integrations/social/dribbble.provider';
import { LinkedinPageProvider } from '@gitroom/nestjs-libraries/integrations/social/linkedin.page.provider';
import { ThreadsProvider } from '@gitroom/nestjs-libraries/integrations/social/threads.provider';
import { DiscordProvider } from '@gitroom/nestjs-libraries/integrations/social/discord.provider';
import { SlackProvider } from '@gitroom/nestjs-libraries/integrations/social/slack.provider';
import { MastodonProvider } from '@gitroom/nestjs-libraries/integrations/social/mastodon.provider';
import { MastodonCustomProvider } from '@gitroom/nestjs-libraries/integrations/social/mastodon.custom.provider';
import { BlueskyProvider } from '@gitroom/nestjs-libraries/integrations/social/bluesky.provider';
import { LemmyProvider } from '@gitroom/nestjs-libraries/integrations/social/lemmy.provider';
import { InstagramStandaloneProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.standalone.provider';
import { FarcasterProvider } from '@gitroom/nestjs-libraries/integrations/social/farcaster.provider';
import { TelegramProvider } from '@gitroom/nestjs-libraries/integrations/social/telegram.provider';
import { NostrProvider } from '@gitroom/nestjs-libraries/integrations/social/nostr.provider';
import { VkProvider } from '@gitroom/nestjs-libraries/integrations/social/vk.provider';
import { WordpressProvider } from '@gitroom/nestjs-libraries/integrations/social/wordpress.provider';
import { ListmonkProvider } from '@gitroom/nestjs-libraries/integrations/social/listmonk.provider';
import { GmbProvider } from '@gitroom/nestjs-libraries/integrations/social/gmb.provider';
import { KickProvider } from '@gitroom/nestjs-libraries/integrations/social/kick.provider';
import { TwitchProvider } from '@gitroom/nestjs-libraries/integrations/social/twitch.provider';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { MoltbookProvider } from '@gitroom/nestjs-libraries/integrations/social/moltbook.provider';
import { SkoolProvider } from '@gitroom/nestjs-libraries/integrations/social/skool.provider';
import { WhopProvider } from '@gitroom/nestjs-libraries/integrations/social/whop.provider';
import { MeweProvider } from '@gitroom/nestjs-libraries/integrations/social/mewe.provider';
import { TumblrProvider } from '@gitroom/nestjs-libraries/integrations/social/tumblr.provider';

export const socialIntegrationList: Array<SocialAbstract & SocialProvider> = [
  new XProvider(),
  new LinkedinProvider(),
  new LinkedinPageProvider(),
  new RedditProvider(),
  new InstagramProvider(),
  new InstagramStandaloneProvider(),
  new FacebookProvider(),
  new ThreadsProvider(),
  new YoutubeProvider(),
  new GmbProvider(),
  new TiktokProvider(),
  new TiktokBusinessProvider(),
  new PinterestProvider(),
  new DribbbleProvider(),
  new DiscordProvider(),
  new SlackProvider(),
  new KickProvider(),
  new TwitchProvider(),
  new MastodonProvider(),
  new BlueskyProvider(),
  new LemmyProvider(),
  new FarcasterProvider(),
  new TelegramProvider(),
  new NostrProvider(),
  new VkProvider(),
  new MediumProvider(),
  new DevToProvider(),
  new HashnodeProvider(),
  new WordpressProvider(),
  new ListmonkProvider(),
  new MoltbookProvider(),
  new WhopProvider(),
  new SkoolProvider(),
  new MeweProvider(),
  new TumblrProvider(),
  new MastodonCustomProvider(),
];

@Injectable()
export class IntegrationManager {
  // Both are env-driven so cloud and self-hosted instances can differ:
  // HIDDEN_PROVIDERS ("tiktok,x") hides providers from the add-channel screen,
  // MIGRATE_PROVIDERS ("tiktok:tiktok-business") routes a reconnect of the old
  // provider through the new provider's OAuth and migrates the channel in
  // place, keeping its id, scheduled posts and settings.
  isHiddenProvider(identifier: string) {
    return (process.env.HIDDEN_PROVIDERS || '')
      .split(',')
      .map((p) => p.trim())
      .includes(identifier);
  }

  private envList(name: string) {
    return (process.env[name] || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }

  // COMING_SOON_PROVIDERS ("mewe,tumblr") are hidden providers nobody can use
  // yet; the add-channel screen shows them with a waitlist instead.
  isComingSoonProvider(identifier: string) {
    return (
      this.isHiddenProvider(identifier) &&
      this.envList('COMING_SOON_PROVIDERS').includes(identifier)
    );
  }

  // PREVIEW_PROVIDERS ("facebook,instagram") are hidden providers in tester
  // preview. A tester organization is one listed in PREVIEW_ORGS (comma list of
  // organization ids) or, via `approved`, one an admin approved for that
  // provider in the early-access table. Everyone else cannot start or finish a
  // connect of a hidden provider: hiding it from the list alone would leave the
  // connect endpoints open.
  isPreviewListed(identifier: string) {
    return (
      this.isHiddenProvider(identifier) &&
      !this.isComingSoonProvider(identifier) &&
      this.envList('PREVIEW_PROVIDERS').includes(identifier)
    );
  }

  isPreviewProvider(identifier: string, orgId?: string, approved: string[] = []) {
    return (
      !!orgId &&
      this.isPreviewListed(identifier) &&
      (this.envList('PREVIEW_ORGS').includes(orgId) ||
        approved.includes(identifier))
    );
  }

  // STAFF_PROVIDERS ("facebook,instagram,threads") are hidden providers that
  // keep their public tier exactly as configured (coming soon, tester preview)
  // but that the organizations in PREVIEW_ORGS can still connect. Only the
  // env list counts: a database approval never opens a staff provider.
  isStaffProvider(identifier: string, orgId?: string) {
    return (
      !!orgId &&
      this.isHiddenProvider(identifier) &&
      this.envList('STAFF_PROVIDERS').includes(identifier) &&
      this.envList('PREVIEW_ORGS').includes(orgId)
    );
  }

  isAvailableTo(identifier: string, orgId?: string, approved: string[] = []) {
    return (
      !this.isHiddenProvider(identifier) ||
      this.isPreviewProvider(identifier, orgId, approved) ||
      this.isStaffProvider(identifier, orgId)
    );
  }

  // Note: a target provider that implements `reConnect` is not supported - the
  // connect callback would run reConnect with the old app-scoped id before the
  // migration is attempted.
  getMigrationTarget(identifier: string): string | undefined {
    const [, target] =
      (process.env.MIGRATE_PROVIDERS || '')
        .split(',')
        .map((p) => p.trim().split(':'))
        .find(([from, to]) => from === identifier && !!to) || [];

    return target &&
      target !== identifier &&
      this.getAllowedSocialsIntegrations().includes(target)
      ? target
      : undefined;
  }

  // Reverse lookup of MIGRATE_PROVIDERS: the providers whose channels a fresh
  // connect of `identifier` should adopt instead of creating a duplicate.
  getMigrationSources(identifier: string): string[] {
    return (process.env.MIGRATE_PROVIDERS || '')
      .split(',')
      .map((p) => p.trim().split(':'))
      .filter(
        ([from, to]) =>
          to === identifier &&
          !!from &&
          from !== identifier &&
          this.getAllowedSocialsIntegrations().includes(from)
      )
      .map(([from]) => from);
  }

  async getAllIntegrations() {
    return {
      social: await this.describeIntegrations(
        socialIntegrationList.filter(
          (p) => !this.isHiddenProvider(p.identifier)
        )
      ),
      article: [] as any[],
    };
  }

  // The two hidden tiers for the add-channel screen: tester-preview providers
  // (testerAccess says whether this organization can connect them) and
  // coming-soon providers (nobody can). `approved` are the providers an admin
  // approved this organization for; `waiting` and `requested` come from the
  // early-access table (waiting count per provider, this organization's own
  // request status per provider).
  async getPreviewIntegrations(
    orgId: string,
    approved: string[] = [],
    waiting: Record<string, number> = {},
    requested: Record<string, string> = {}
  ) {
    const tiers = socialIntegrationList.filter(
      (p) =>
        this.isPreviewListed(p.identifier) ||
        this.isComingSoonProvider(p.identifier) ||
        this.isStaffProvider(p.identifier, orgId)
    );
    const described = await this.describeIntegrations(tiers);
    return {
      social: described.map((p) => ({
        ...p,
        ...(this.isStaffProvider(p.identifier, orgId)
          ? { testerAccess: true, staff: true }
          : this.isComingSoonProvider(p.identifier)
          ? { comingSoon: true }
          : {
              testerAccess: this.isPreviewProvider(
                p.identifier,
                orgId,
                approved
              ),
            }),
        waiting: waiting[p.identifier] || 0,
        ...(requested[p.identifier]
          ? { myRequest: requested[p.identifier] }
          : {}),
      })),
    };
  }

  private describeIntegrations(list: typeof socialIntegrationList) {
    return Promise.all(
      list.map(async (p) => ({
        name: p.name,
        identifier: p.identifier,
        toolTip: p.toolTip,
        editor: p.editor,
        isExternal: !!p.externalUrl,
        isWeb3: !!p.isWeb3,
        isChromeExtension: !!p.isChromeExtension,
        ...(p.extensionCookies ? { extensionCookies: p.extensionCookies } : {}),
        ...(p.customFields ? { customFields: await p.customFields() } : {}),
      }))
    );
  }

  // A client may only call provider methods marked with @Tool (see getAllTools)
  // or listed in providerHelperFunctions; anything else is not a public helper.
  isPublicFunction(identifier: string, methodName: string) {
    const provider = this.getSocialIntegration(identifier);
    if (!provider) {
      return false;
    }

    const tools = this.getAllTools()[identifier] || [];
    return (
      // @ts-ignore
      typeof provider[methodName] === 'function' &&
      (tools.some((p) => p.methodName === methodName) ||
        providerHelperFunctions.includes(methodName))
    );
  }

  getAllTools(): {
    [key: string]: {
      description: string;
      dataSchema: any;
      methodName: string;
    }[];
  } {
    return socialIntegrationList.reduce(
      (all, current) => ({
        ...all,
        [current.identifier]:
          Reflect.getMetadata('custom:tool', current.constructor.prototype) ||
          [],
      }),
      {}
    );
  }

  getAllRulesDescription(): {
    [key: string]: string;
  } {
    return socialIntegrationList.reduce(
      (all, current) => ({
        ...all,
        [current.identifier]:
          Reflect.getMetadata(
            'custom:rules:description',
            current.constructor
          ) || '',
      }),
      {}
    );
  }

  getAllPlugs() {
    return socialIntegrationList
      .map((p) => {
        return {
          name: p.name,
          identifier: p.identifier,
          plugs: (
            Reflect.getMetadata('custom:plug', p.constructor.prototype) || []
          )
            .filter((f: any) => !f.disabled)
            .map((p: any) => ({
              ...p,
              fields: p.fields.map((c: any) => ({
                ...c,
                validation: c?.validation?.toString(),
              })),
            })),
        };
      })
      .filter((f) => f.plugs.length);
  }

  getInternalPlugs(providerName: string) {
    const p = socialIntegrationList.find((p) => p.identifier === providerName)!;
    return {
      internalPlugs:
        (
          Reflect.getMetadata(
            'custom:internal_plug',
            p.constructor.prototype
          ) || []
        ).filter((f: any) => !f.disabled) || [],
    };
  }

  getAllowedSocialsIntegrations() {
    return socialIntegrationList.map((p) => p.identifier);
  }
  getSocialIntegration(integration: string): SocialProvider {
    return socialIntegrationList.find((i) => i.identifier === integration)!;
  }
}

// Removes credential keys from whatever a provider helper returns before it
// goes back to the client (helpers may echo the integration they were given).
const secretKeys = ['accessToken', 'refreshToken', 'token'];
export function stripSecretKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSecretKeys(item)) as T;
  }

  if (!value || typeof value !== 'object' || value.constructor !== Object) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !secretKeys.includes(key))
      .map(([key, item]) => [key, stripSecretKeys(item)])
  ) as T;
}
