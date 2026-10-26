import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

const mine = {
  id: true,
  provider: true,
  kind: true,
  status: true,
  newsletter: true,
  createdAt: true,
} as const;

@Injectable()
export class EarlyAccessRepository {
  constructor(private _earlyAccess: PrismaRepository<'earlyAccess'>) {}

  // Idempotent per organization + provider: asking twice never creates a
  // second row, it only lets a later "yes" to the newsletter stick.
  upsertRequest(data: {
    organizationId: string;
    userId: string;
    provider: string;
    kind: string;
    note?: string;
    newsletter: boolean;
  }) {
    return this._earlyAccess.model.earlyAccess.upsert({
      where: {
        organizationId_provider: {
          organizationId: data.organizationId,
          provider: data.provider,
        },
      },
      create: data,
      update: data.newsletter ? { newsletter: true } : {},
      select: mine,
    });
  }

  findForOrganization(organizationId: string, provider: string) {
    return this._earlyAccess.model.earlyAccess.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
      select: { id: true },
    });
  }

  listForOrganization(organizationId: string) {
    return this._earlyAccess.model.earlyAccess.findMany({
      where: { organizationId },
      select: mine,
    });
  }

  async countsByProvider() {
    const rows = await this._earlyAccess.model.earlyAccess.groupBy({
      by: ['provider'],
      _count: { _all: true },
    });
    return rows.map((r) => ({ provider: r.provider, count: r._count._all }));
  }

  listAll() {
    return this._earlyAccess.model.earlyAccess.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        provider: true,
        kind: true,
        note: true,
        newsletter: true,
        status: true,
        createdAt: true,
        organization: { select: { id: true, name: true } },
        user: { select: { email: true } },
      },
    });
  }

  findById(id: string) {
    return this._earlyAccess.model.earlyAccess.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        status: true,
        provider: true,
        user: { select: { email: true } },
      },
    });
  }

  // Moves a tester request to approved only if it is still waiting, so two
  // presses (or two admins) approve, and email, once. Returns how many rows
  // changed: 1 the first time, 0 after that.
  async approveIfRequested(id: string) {
    const { count } = await this._earlyAccess.model.earlyAccess.updateMany({
      where: { id, status: 'requested' },
      data: { status: 'approved' },
    });
    return count;
  }

  listWaitlistToNotify(provider: string) {
    return this._earlyAccess.model.earlyAccess.findMany({
      where: { provider, kind: 'waitlist', status: 'requested' },
      select: { id: true, user: { select: { email: true } } },
    });
  }

  markNotified(ids: string[]) {
    return this._earlyAccess.model.earlyAccess.updateMany({
      where: { id: { in: ids } },
      data: { status: 'notified' },
    });
  }
}
