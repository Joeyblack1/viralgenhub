import { BadRequestException, Injectable } from '@nestjs/common';
import { EarlyAccessRepository } from '@gitroom/nestjs-libraries/database/prisma/early-access/early.access.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { EarlyAccessRequestDto } from '@gitroom/nestjs-libraries/dtos/integrations/early.access.dto';

@Injectable()
export class EarlyAccessService {
  constructor(
    private _earlyAccessRepository: EarlyAccessRepository,
    private _integrationManager: IntegrationManager,
    private _emailService: EmailService
  ) {}

  // The kind comes from the server's tier lists, never from the client.
  kindFor(provider: string): 'tester' | 'waitlist' | undefined {
    if (this._integrationManager.isPreviewListed(provider)) {
      return 'tester';
    }
    if (this._integrationManager.isComingSoonProvider(provider)) {
      return 'waitlist';
    }
    return undefined;
  }

  request(orgId: string, userId: string, body: EarlyAccessRequestDto) {
    const kind = this.kindFor(body.provider);
    if (!kind) {
      throw new BadRequestException('This platform is not in early access');
    }
    return this._earlyAccessRepository.upsertRequest({
      organizationId: orgId,
      userId,
      provider: body.provider,
      kind,
      note: body.note?.trim() || undefined,
      newsletter: !!body.newsletter,
    });
  }

  listMine(orgId: string) {
    return this._earlyAccessRepository.listForOrganization(orgId);
  }

  // Providers an admin approved this organization to test.
  async approvedProviders(orgId: string) {
    const mine = await this._earlyAccessRepository.listForOrganization(orgId);
    return mine
      .filter((r) => r.kind === 'tester' && r.status === 'approved')
      .map((r) => r.provider);
  }

  async previewIntegrations(orgId: string) {
    const [mine, counts] = await Promise.all([
      this._earlyAccessRepository.listForOrganization(orgId),
      this._earlyAccessRepository.countsByProvider(),
    ]);
    return this._integrationManager.getPreviewIntegrations(
      orgId,
      mine
        .filter((r) => r.kind === 'tester' && r.status === 'approved')
        .map((r) => r.provider),
      Object.fromEntries(counts.map((c) => [c.provider, c.count])),
      Object.fromEntries(mine.map((r) => [r.provider, r.status]))
    );
  }

  async adminList() {
    const rows = await this._earlyAccessRepository.listAll();
    const providers = new Map<
      string,
      { provider: string; waiting: number; requests: typeof rows }
    >();
    for (const row of rows) {
      const group = providers.get(row.provider) || {
        provider: row.provider,
        waiting: 0,
        requests: [],
      };
      group.waiting += 1;
      group.requests.push(row);
      providers.set(row.provider, group);
    }
    return { providers: [...providers.values()] };
  }

  async approve(id: string) {
    const row = await this._earlyAccessRepository.findById(id);
    if (!row) {
      throw new BadRequestException('Request not found');
    }
    if (row.kind !== 'tester') {
      throw new BadRequestException('Only tester requests can be approved');
    }
    return this._earlyAccessRepository.setStatus(id, 'approved');
  }

  // Emails everyone on the waitlist for a platform that has gone live, then
  // marks them notified. A failed send leaves that row as requested so a
  // second press retries only those.
  async notifyWaitlist(provider: string) {
    const name =
      this._integrationManager.getSocialIntegration(provider)?.name ||
      provider;
    const rows = await this._earlyAccessRepository.listWaitlistToNotify(
      provider
    );
    const done: string[] = [];
    for (const row of rows) {
      try {
        await this._emailService.sendEmailSync(
          row.user.email,
          `${name} is now live on ViralGenHub`,
          `<p>Good news: ${name} is now live on ViralGenHub.</p><p>Open Add Channel to connect it.</p>`
        );
        done.push(row.id);
      } catch (err) {
        console.log('early-access notify failed', provider, err);
      }
    }
    if (done.length) {
      await this._earlyAccessRepository.markNotified(done);
    }
    return { notified: done.length, failed: rows.length - done.length };
  }
}
