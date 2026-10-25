import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { tags } from '@gitroom/nestjs-libraries/integrations/social/hashnode.tags';
import { jsonToGraphQLQuery } from 'json-to-graphql-query';
import { HashnodeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/hashnode.settings.dto';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';

// The one place the Hashnode GraphQL endpoint lives. gql.hashnode.com now
// 301-redirects to the changelog page, gql-beta.hashnode.com still answers.
const HASHNODE_API_URL = 'https://gql-beta.hashnode.com';

export const HASHNODE_PRO_REQUIRED_MESSAGE =
  'Hashnode now requires a Hashnode Pro plan on your blog to post through its API. Upgrade your blog to Pro in Hashnode → Billing, then try again.';

export class HashnodeProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3; // Hashnode has lenient publishing limits
  identifier = 'hashnode';
  name = 'Hashnode';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'markdown' as const;
  maxLength() {
    return 10000;
  }
  dto = HashnodeSettingsDto;

  async generateAuthUrl() {
    const state = makeSecureId(6);
    return {
      url: state,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
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

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    // Since 13 May 2026 every Hashnode GraphQL request needs Pro on the blog.
    if (
      status === 402 ||
      status === 403 ||
      /pro plan|hashnode pro|requires? (a )?pro|upgrade to pro|payment required|paid (plan|access)|FORBIDDEN/i.test(
        body
      )
    ) {
      return { type: 'bad-body', value: HASHNODE_PRO_REQUIRED_MESSAGE };
    }

    return undefined;
  }

  async customFields() {
    return [
      {
        key: 'apiKey',
        label: 'API key',
        validation: `/^.{3,}$/`,
        type: 'password' as const,
      },
    ];
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = JSON.parse(Buffer.from(params.code, 'base64').toString());
    try {
      const {
        data: {
          me: { name, id, profilePicture, username },
        },
      } = await (
        await fetch(HASHNODE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `${body.apiKey}`,
          },
          body: JSON.stringify({
            query: `
                    query {
                      me {
                        name,
                        id,
                        profilePicture
                        username
                      }
                    }
                `,
          }),
        })
      ).json();

      return {
        refreshToken: '',
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: body.apiKey,
        id,
        name,
        picture: profilePicture || '',
        username,
      };
    } catch (err) {
      return 'Invalid credentials';
    }
  }

  async tags() {
    return tags.map((tag) => ({ value: tag.objectID, label: tag.name }));
  }

  @Tool({ description: 'Tags', dataSchema: [] })
  tagsList() {
    return tags;
  }

  @Tool({ description: 'Publications', dataSchema: [] })
  async publications(accessToken: string) {
    const {
      data: {
        me: {
          publications: { edges },
        },
      },
    } = await (
      await fetch(HASHNODE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${accessToken}`,
        },
        body: JSON.stringify({
          query: `
            query {
              me {
                publications (first: 50) {
                  edges{
                    node {
                      id
                      title
                    }
                  }
                }
              }
            }
                `,
        }),
      })
    ).json();

    return edges.map(
      ({ node: { id, title } }: { node: { id: string; title: string } }) => ({
        id,
        name: title,
      })
    );
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { settings } = postDetails?.[0] || { settings: {} };
    const query = jsonToGraphQLQuery(
      {
        mutation: {
          publishPost: {
            __args: {
              input: {
                title: settings.title,
                publicationId: settings.publication,
                ...(settings.canonical
                  ? { originalArticleURL: settings.canonical }
                  : {}),
                contentMarkdown: postDetails?.[0].message,
                tags: settings.tags.map((tag: any) => ({
                  slug: tags.find((t) => t.objectID === tag.value)?.slug,
                })),
                ...(settings.subtitle ? { subtitle: settings.subtitle } : {}),
                ...(settings.main_image
                  ? {
                      coverImage: `${
                        settings?.main_image?.path?.indexOf('http') === -1
                          ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/${process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY}`
                          : ``
                      }${settings?.main_image?.path}`,
                    }
                  : {}),
              },
            },
            post: {
              id: true,
              url: true,
            },
          },
        },
      },
      { pretty: true }
    );

    const { data, errors } = await (
      await this.fetch(HASHNODE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${accessToken}`,
        },
        body: JSON.stringify({
          query,
        }),
      })
    ).json();

    if (errors?.length || !data?.publishPost?.post) {
      const errorBody = JSON.stringify(errors || data || {});
      throw new BadBody(
        this.identifier,
        errorBody,
        '{}',
        this.handleErrors(errorBody, 200)?.value ||
          errors?.[0]?.message ||
          'Hashnode could not publish the post'
      );
    }

    const {
      publishPost: {
        post: { id: postId, url },
      },
    } = data;

    return [
      {
        id: postDetails?.[0].id,
        status: 'completed',
        postId: postId,
        releaseURL: url,
      },
    ];
  }
}
