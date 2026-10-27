import { Injectable } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export interface PurgeCounts {
  posts: number;
  comments: number;
  errors: number;
  media: number;
  integrations: number;
  tags: number;
  webhooks: number;
  signatures: number;
  sets: number;
  autoPosts: number;
  notifications: number;
  thirdParties: number;
}

export interface PurgeResult {
  counts: PurgeCounts;
  // public URLs of the media files whose rows were deleted
  files: string[];
}

// Hard deletion of the workspaces of deleted accounts (#393). Every query is
// scoped to ONE organization id that the account deletion marked with
// purgeAfter; nothing here runs for a workspace without that mark.
@Injectable()
export class AccountPurgeRepository {
  constructor(private _prisma: PrismaService) {}

  // workspaces whose owner deleted the account and whose 30 days are over
  findDue(now: Date, take = 50) {
    return this._prisma.organization.findMany({
      where: {
        purgeAfter: { lte: now },
        purgedAt: null,
        deletedAt: { not: null },
      },
      select: { id: true, purgeAfter: true },
      orderBy: { purgeAfter: 'asc' },
      take,
    });
  }

  // a member whose account is not deleted means someone still uses the
  // workspace: it is never purged
  countLiveMembers(orgId: string) {
    return this._prisma.userOrganization.count({
      where: { organizationId: orgId, user: { deletedAt: null } },
    });
  }

  // another media row (any workspace) still pointing at the same file
  countMediaUsingFile(path: string) {
    return this._prisma.media.count({
      where: { OR: [{ path }, { thumbnail: path }] },
    });
  }

  purgeOrganization(orgId: string, now: Date): Promise<PurgeResult> {
    return this._prisma.$transaction(
      async (tx) => {
        const postIds = (
          await tx.post.findMany({
            where: { organizationId: orgId },
            select: { id: true },
          })
        ).map((p) => p.id);
        const integrationIds = (
          await tx.integration.findMany({
            where: { organizationId: orgId },
            select: { id: true },
          })
        ).map((p) => p.id);
        const webhookIds = (
          await tx.webhooks.findMany({
            where: { organizationId: orgId },
            select: { id: true },
          })
        ).map((p) => p.id);
        // a file someone's avatar, an agency logo or an OAuth app picture
        // uses is kept (those rows belong to other records)
        const media = await tx.media.findMany({
          where: {
            organizationId: orgId,
            userPicture: { none: {} },
            agencies: { none: {} },
            oauthApps: { none: {} },
          },
          select: { id: true, path: true, thumbnail: true },
        });

        // replies point at their parent comment: unlink before deleting
        const commentsWhere = {
          OR: [{ organizationId: orgId }, { postId: { in: postIds } }],
        };
        await tx.comments.updateMany({
          where: commentsWhere,
          data: { parentId: null },
        });
        const comments = await tx.comments.deleteMany({ where: commentsWhere });

        await tx.tagsPosts.deleteMany({
          where: {
            OR: [{ postId: { in: postIds } }, { tag: { orgId } }],
          },
        });
        const errors = await tx.errors.deleteMany({
          where: {
            OR: [{ organizationId: orgId }, { postId: { in: postIds } }],
          },
        });
        await tx.payoutProblems.updateMany({
          where: { postId: { in: postIds } },
          data: { postId: null },
        });
        // thread items point at the previous item: unlink before deleting
        await tx.post.updateMany({
          where: { organizationId: orgId },
          data: { parentPostId: null },
        });
        const posts = await tx.post.deleteMany({
          where: { organizationId: orgId },
        });

        await tx.plugs.deleteMany({
          where: {
            OR: [
              { organizationId: orgId },
              { integrationId: { in: integrationIds } },
            ],
          },
        });
        await tx.exisingPlugData.deleteMany({
          where: { integrationId: { in: integrationIds } },
        });
        await tx.integrationsWebhooks.deleteMany({
          where: {
            OR: [
              { integrationId: { in: integrationIds } },
              { webhookId: { in: webhookIds } },
            ],
          },
        });
        const integrations = await tx.integration.deleteMany({
          where: { organizationId: orgId },
        });
        const webhooks = await tx.webhooks.deleteMany({
          where: { organizationId: orgId },
        });
        const tags = await tx.tags.deleteMany({ where: { orgId } });
        const signatures = await tx.signatures.deleteMany({
          where: { organizationId: orgId },
        });
        const sets = await tx.sets.deleteMany({
          where: { organizationId: orgId },
        });
        const autoPosts = await tx.autoPost.deleteMany({
          where: { organizationId: orgId },
        });
        const notifications = await tx.notifications.deleteMany({
          where: { organizationId: orgId },
        });
        const thirdParties = await tx.thirdParty.deleteMany({
          where: { organizationId: orgId },
        });
        const mediaDeleted = await tx.media.deleteMany({
          where: {
            organizationId: orgId,
            id: { in: media.map((m) => m.id) },
          },
        });

        // the row itself stays (billing records point at it), without its
        // name, description or API key
        await tx.organization.update({
          where: { id: orgId },
          data: {
            purgedAt: now,
            name: 'Deleted workspace',
            description: null,
            apiKey: null,
          },
        });

        return {
          counts: {
            posts: posts.count,
            comments: comments.count,
            errors: errors.count,
            media: mediaDeleted.count,
            integrations: integrations.count,
            tags: tags.count,
            webhooks: webhooks.count,
            signatures: signatures.count,
            sets: sets.count,
            autoPosts: autoPosts.count,
            notifications: notifications.count,
            thirdParties: thirdParties.count,
          },
          files: media
            .flatMap((m) => [m.path, m.thumbnail])
            .filter((f): f is string => !!f),
        };
      },
      { timeout: 120000, maxWait: 10000 }
    );
  }

  async stats(now: Date) {
    const [waiting, due, purged, next, last] = await Promise.all([
      this._prisma.organization.count({
        where: { purgeAfter: { gt: now }, purgedAt: null },
      }),
      this._prisma.organization.count({
        where: { purgeAfter: { lte: now }, purgedAt: null },
      }),
      this._prisma.organization.count({
        where: { purgedAt: { not: null } },
      }),
      this._prisma.organization.findFirst({
        where: { purgeAfter: { gt: now }, purgedAt: null },
        orderBy: { purgeAfter: 'asc' },
        select: { purgeAfter: true },
      }),
      this._prisma.organization.findFirst({
        where: { purgedAt: { not: null } },
        orderBy: { purgedAt: 'desc' },
        select: { purgedAt: true },
      }),
    ]);

    return {
      waiting,
      due,
      purged,
      nextPurgeAt: next?.purgeAfter || null,
      lastPurgedAt: last?.purgedAt || null,
    };
  }
}
