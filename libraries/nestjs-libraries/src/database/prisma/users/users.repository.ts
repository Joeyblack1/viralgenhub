import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Provider, Role } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { UserDetailDto } from '@gitroom/nestjs-libraries/dtos/users/user.details.dto';
import { EmailNotificationsDto } from '@gitroom/nestjs-libraries/dtos/users/email-notifications.dto';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

@Injectable()
export class UsersRepository {
  constructor(
    private _user: PrismaRepository<'user'>,
    private _transaction: PrismaTransaction
  ) {}

  async switchUserCredentials(currentUserId: string, targetUserId: string) {
    const current = await this._user.model.user.findUnique({
      where: { id: currentUserId },
    });
    const target = await this._user.model.user.findUnique({
      where: { id: targetUserId },
    });

    if (!current || !target) {
      throw new Error('User not found');
    }

    const currentCredentials = {
      email: current.email,
      password: current.password,
      providerName: current.providerName,
      providerId: current.providerId,
      account: current.account,
      connectedAccount: current.connectedAccount,
      activated: current.activated,
    };
    const targetCredentials = {
      email: target.email,
      password: target.password,
      providerName: target.providerName,
      providerId: target.providerId,
      account: target.account,
      connectedAccount: target.connectedAccount,
      activated: target.activated,
    };

    // (email, providerName) is unique and checked per-statement, so park the
    // current user on a throwaway email first, then fill each freed slot
    await this._transaction.model.$transaction([
      this._user.model.user.update({
        where: { id: current.id },
        data: { email: `switch-${makeId(10)}-${current.email}` },
      }),
      // both accounts' open sessions stop: whoever holds one must log in
      // again with the credentials that now belong to that account
      this._user.model.user.update({
        where: { id: target.id },
        data: { ...currentCredentials, tokenVersion: { increment: 1 } },
      }),
      this._user.model.user.update({
        where: { id: current.id },
        data: { ...targetCredentials, tokenVersion: { increment: 1 } },
      }),
    ]);

    return {
      kept: { id: current.id, email: targetCredentials.email },
      switched: { id: target.id, email: currentCredentials.email },
    };
  }

  getImpersonateUser(name: string) {
    return this._user.model.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            name: {
              contains: name,
            },
          },
          {
            email: {
              contains: name,
            },
          },
          {
            id: {
              contains: name,
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      take: 10,
    });
  }

  getUserById(id: string) {
    return this._user.model.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  getUserByEmail(email: string) {
    return this._user.model.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
        providerName: Provider.LOCAL,
        deletedAt: null,
      },
      include: {
        picture: {
          select: {
            id: true,
            path: true,
          },
        },
      },
    });
  }

  getUserWithActiveSubscriptionByEmail(email: string, excludeUserId: string) {
    return this._user.model.user.findFirst({
      where: {
        email,
        id: { not: excludeUserId },
        deletedAt: null,
        organizations: {
          some: {
            role: Role.SUPERADMIN,
            organization: {
              subscription: { is: { deletedAt: null } },
            },
          },
        },
      },
      select: { id: true, email: true, providerName: true },
    });
  }

  activateUser(id: string) {
    return this._user.model.user.update({
      where: {
        id,
      },
      data: {
        activated: true,
      },
    });
  }

  getUserByProvider(providerId: string, provider: Provider) {
    return this._user.model.user.findFirst({
      where: {
        providerId,
        providerName: provider,
        deletedAt: null,
      },
    });
  }

  // Users are unique on (email, providerName), so a verified social sign-in
  // has to find the account that already owns this e-mail whatever provider
  // created it. Only activated accounts count: an unactivated one could have
  // been pre-registered by someone else with the victim's address.
  getActivatedUserByEmailAnyProvider(email: string) {
    return this._user.model.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
        activated: true,
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        providerName: true,
        providerId: true,
        name: true,
        lastName: true,
        isSuperAdmin: true,
        bio: true,
        audience: true,
        pictureId: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
        lastReadNotifications: true,
        inviteId: true,
        activated: true,
        account: true,
        connectedAccount: true,
        lastOnline: true,
        ip: true,
        agent: true,
        deletedAt: true,
        tokenVersion: true,
        disabled: true,
        sendSuccessEmails: true,
        sendFailureEmails: true,
        sendStreakEmails: true,
      },
    });
  }

  // Super-admin listing: identity, workspaces and their plan, never
  // credentials or tokens
  async listUsers(params: { page?: number; limit?: number; search?: string }) {
    const page = Math.max(0, params.page || 0);
    const limit = Math.min(Math.max(1, params.limit || 20), 100);
    const skip = page * limit;
    const where = {
      deletedAt: null,
      ...(params.search
        ? {
            OR: [
              { email: { contains: params.search, mode: 'insensitive' as const } },
              { name: { contains: params.search, mode: 'insensitive' as const } },
              {
                lastName: {
                  contains: params.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this._user.model.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          lastName: true,
          providerName: true,
          activated: true,
          disabled: true,
          isSuperAdmin: true,
          createdAt: true,
          lastOnline: true,
          organizations: {
            where: { organization: { deletedAt: null } },
            select: {
              role: true,
              disabled: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                  subscription: {
                    where: { deletedAt: null },
                    select: { subscriptionTier: true, period: true },
                  },
                },
              },
            },
          },
        },
      }),
      this._user.model.user.count({ where }),
    ]);

    return {
      items: items.map(({ organizations, ...user }) => ({
        ...user,
        workspaces: organizations.map((member) => ({
          id: member.organization.id,
          name: member.organization.name,
          role: member.role,
          memberDisabled: member.disabled,
          plan: member.organization.subscription?.subscriptionTier || 'FREE',
          period: member.organization.subscription?.period || null,
        })),
      })),
      total,
      page,
      limit,
    };
  }

  setDisabled(id: string, disabled: boolean) {
    return this._user.model.user.update({
      where: { id },
      data: { disabled },
      select: { id: true, email: true, disabled: true },
    });
  }

  async deleteAccount(userId: string) {
    const user = await this._user.model.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user || user.deletedAt) {
      return;
    }

    const hash = (value: string) =>
      createHash('md5').update(value).digest('hex');

    // Hash the identifying fields instead of removing the row, the random
    // suffix keeps [email, providerName] unique if the same email is deleted
    // more than once
    return this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        email: `deleted_${hash(user.email.toLowerCase())}_${makeId(5)}`,
        password: null,
        name: user.name ? hash(user.name) : null,
        lastName: user.lastName ? hash(user.lastName) : null,
        providerId: user.providerId ? hash(user.providerId) : null,
        bio: null,
        ip: null,
        agent: null,
        account: null,
        pictureId: null,
        deletedAt: new Date(),
        // every session of the deleted account stops working at once
        tokenVersion: { increment: 1 },
      },
    });
  }

  async updatePassword(id: string, password: string) {
    const hashed = await AuthService.hashPassword(password);
    return this._user.model.user.update({
      where: {
        id,
        providerName: Provider.LOCAL,
      },
      data: {
        password: hashed,
        // a reset logs every other session of the account out
        tokenVersion: { increment: 1 },
      },
    });
  }

  changeAudienceSize(userId: string, audience: number) {
    return this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        audience,
      },
    });
  }

  async getPersonal(userId: string) {
    const user = await this._user.model.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        name: true,
        bio: true,
        picture: {
          select: {
            id: true,
            path: true,
          },
        },
      },
    });

    return user;
  }

  async changePersonal(userId: string, body: UserDetailDto) {
    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        name: body.fullname,
        bio: body.bio,
        picture: body.picture
          ? {
              connect: {
                id: body.picture.id,
              },
            }
          : {
              disconnect: true,
            },
      },
    });
  }

  async getEmailNotifications(userId: string) {
    return this._user.model.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        sendSuccessEmails: true,
        sendFailureEmails: true,
        sendStreakEmails: true,
      },
    });
  }

  async updateEmailNotifications(userId: string, body: EmailNotificationsDto) {
    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        sendSuccessEmails: body.sendSuccessEmails,
        sendFailureEmails: body.sendFailureEmails,
        sendStreakEmails: body.sendStreakEmails,
      },
    });
  }
}
