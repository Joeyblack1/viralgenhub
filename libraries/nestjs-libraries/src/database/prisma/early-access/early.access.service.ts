import { BadRequestException, Injectable } from '@nestjs/common';
import { EarlyAccessRepository } from '@gitroom/nestjs-libraries/database/prisma/early-access/early.access.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { EarlyAccessRequestDto } from '@gitroom/nestjs-libraries/dtos/integrations/early.access.dto';
import {
  autoApproves,
  platformStep,
} from '@gitroom/nestjs-libraries/database/prisma/early-access/early.access.platform';

// Workspace and platform names go into email HTML; workspace names are typed
// by users.
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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

  async request(
    orgId: string,
    userId: string,
    body: EarlyAccessRequestDto,
    workspaceName = ''
  ) {
    const kind = this.kindFor(body.provider);
    if (!kind) {
      throw new BadRequestException('This platform is not in early access');
    }
    // Only a first tester request tells the admin; asking again (or ticking
    // the newsletter later) goes through the same upsert and stays quiet.
    const isNewTester =
      kind === 'tester' &&
      !(await this._earlyAccessRepository.findForOrganization(
        orgId,
        body.provider
      ));
    const row = await this._earlyAccessRepository.upsertRequest({
      organizationId: orgId,
      userId,
      provider: body.provider,
      kind,
      note: body.note?.trim() || undefined,
      newsletter: !!body.newsletter,
    });
    // A platform that needs no step of its own (EARLY_ACCESS_AUTO_APPROVE)
    // is approved at once: the requester gets the approval email and nobody
    // has to press Approve, so the admin is not emailed either.
    if (isNewTester && autoApproves(body.provider)) {
      await this.approve(row.id);
      return { ...row, status: 'approved' };
    }
    if (isNewTester) {
      await this.notifyAdmin(body.provider, kind, workspaceName);
    }
    return row;
  }

  private platformName(provider: string) {
    return (
      this._integrationManager.getSocialIntegration(provider)?.name || provider
    );
  }

  // One email to EARLY_ACCESS_NOTIFY_EMAIL per new tester request (waitlist
  // rows can be many; their count shows on the admin page). Never throws into
  // the request: a failed send is logged and the request still succeeds.
  private async notifyAdmin(provider: string, kind: string, workspace: string) {
    const to = process.env.EARLY_ACCESS_NOTIFY_EMAIL;
    if (!to) {
      return;
    }
    const name = this.platformName(provider);
    const link = `${process.env.FRONTEND_URL}/admin/early-access`;
    try {
      await this._emailService.sendEmailSync(
        to,
        `New ${name} ${kind} request on ViralGenHub`,
        `<p>Platform: ${escapeHtml(name)}</p><p>Kind: ${escapeHtml(
          kind
        )}</p><p>Workspace: ${escapeHtml(
          workspace || '(unnamed)'
        )}</p><p><a href="${link}">Review it in admin</a>: ${link}</p>`
      );
    } catch (err) {
      console.log('early-access admin notify failed', provider, err);
    }
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
      // Waiting means nobody has acted on it yet: approved testers and
      // notified waitlist rows no longer count.
      if (row.status === 'requested') {
        group.waiting += 1;
      }
      group.requests.push(row);
      providers.set(row.provider, group);
    }
    return {
      providers: [...providers.values()].map((group) => ({
        ...group,
        platformStep: platformStep(group.provider),
        autoApprove: autoApproves(group.provider),
      })),
    };
  }

  async approve(id: string) {
    const row = await this._earlyAccessRepository.findById(id);
    if (!row) {
      throw new BadRequestException('Request not found');
    }
    if (row.kind !== 'tester') {
      throw new BadRequestException('Only tester requests can be approved');
    }
    const step = platformStep(row.provider);
    // Email the requester only when this press actually approved the row, so
    // the approval email goes out once however many times Approve is pressed.
    if (await this._earlyAccessRepository.approveIfRequested(id)) {
      const name = this.platformName(row.provider);
      const link = `${process.env.FRONTEND_URL}/launches?early=${encodeURIComponent(
        row.provider
      )}`;
      try {
        await this._emailService.sendEmailSync(
          row.user.email,
          `You're approved to test ${name} on ViralGenHub`,
          `<p>You're approved to test ${escapeHtml(
            name
          )} on ViralGenHub.</p>${
            step.userText ? `<p>${escapeHtml(step.userText)}</p>` : ''
          }<p>Connect it now: <a href="${link}">${link}</a></p>`
        );
      } catch (err) {
        console.log('early-access approval email failed', id, err);
      }
    }
    return { id, status: 'approved', platformStep: step };
  }

  // Emails everyone on the waitlist for a platform that has gone live, then
  // marks them notified. A failed send leaves that row as requested so a
  // second press retries only those.
  async notifyWaitlist(provider: string) {
    const name = this.platformName(provider);
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
