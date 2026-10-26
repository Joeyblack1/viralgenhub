import 'reflect-metadata';
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/early-access/early.access.repository',
  () => ({ EarlyAccessRepository: class {} })
);

import { EarlyAccessService } from './early.access.service';

const make = () => {
  const repo: any = {
    upsertRequest: jest
      .fn()
      .mockImplementation(async (d) => ({ ...d, id: '1' })),
    findById: jest.fn(),
    findForOrganization: jest.fn().mockResolvedValue(null),
    approveIfRequested: jest.fn().mockResolvedValue(1),
    listAll: jest.fn(),
    listWaitlistToNotify: jest.fn(),
    markNotified: jest.fn(),
    listForOrganization: jest.fn(),
  };
  const manager: any = {
    isPreviewListed: (p: string) => p === 'facebook',
    isComingSoonProvider: (p: string) => p === 'mewe',
    getSocialIntegration: () => ({ name: 'MeWe' }),
  };
  const email: any = { sendEmailSync: jest.fn().mockResolvedValue(undefined) };
  return { repo, email, service: new EarlyAccessService(repo, manager, email) };
};

describe('EarlyAccessService', () => {
  it('derives the kind on the server', async () => {
    const { service, repo } = make();
    await service.request('o', 'u', { provider: 'facebook', newsletter: false });
    await service.request('o', 'u', { provider: 'mewe', newsletter: true });
    expect(repo.upsertRequest.mock.calls[0][0].kind).toBe('tester');
    expect(repo.upsertRequest.mock.calls[1][0].kind).toBe('waitlist');
  });

  it('rejects providers that are not hidden tiers', async () => {
    const { service, repo } = make();
    await expect(service.request('o', 'u', { provider: 'x' })).rejects.toThrow();
    expect(repo.upsertRequest).not.toHaveBeenCalled();
  });

  it('is idempotent by going through one upsert keyed on org and provider', async () => {
    const { service, repo } = make();
    await service.request('o', 'u', { provider: 'mewe' });
    await service.request('o', 'u', { provider: 'mewe' });
    expect(repo.upsertRequest).toHaveBeenCalledTimes(2);
    expect(repo.upsertRequest.mock.calls[0][0]).toMatchObject({
      organizationId: 'o',
      provider: 'mewe',
    });
  });

  it('approves tester requests only', async () => {
    const { service, repo } = make();
    repo.findById.mockResolvedValueOnce({ id: '1', kind: 'waitlist' });
    await expect(service.approve('1')).rejects.toThrow();
    repo.findById.mockResolvedValueOnce({
      id: '1',
      kind: 'tester',
      provider: 'facebook',
      user: { email: 't@x.com' },
    });
    await expect(service.approve('1')).resolves.toMatchObject({
      status: 'approved',
    });
  });

  it('returns only approved tester providers as approvals', async () => {
    const { service, repo } = make();
    repo.listForOrganization.mockResolvedValue([
      { provider: 'facebook', kind: 'tester', status: 'approved' },
      { provider: 'instagram', kind: 'tester', status: 'requested' },
      { provider: 'mewe', kind: 'waitlist', status: 'approved' },
    ]);
    expect(await service.approvedProviders('o')).toEqual(['facebook']);
  });

  it('notifies the waitlist and marks only the sent rows', async () => {
    const { service, repo, email } = make();
    repo.listWaitlistToNotify.mockResolvedValue([
      { id: 'a', user: { email: 'a@x.com' } },
      { id: 'b', user: { email: 'b@x.com' } },
    ]);
    email.sendEmailSync
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));
    const res = await service.notifyWaitlist('mewe');
    expect(email.sendEmailSync.mock.calls[0][1]).toBe(
      'MeWe is now live on ViralGenHub'
    );
    expect(repo.markNotified).toHaveBeenCalledWith(['a']);
    expect(res).toEqual({ notified: 1, failed: 1 });
  });

  describe('admin email for new requests', () => {
    const env = process.env.EARLY_ACCESS_NOTIFY_EMAIL;
    beforeEach(() => {
      process.env.EARLY_ACCESS_NOTIFY_EMAIL = 'admin@x.com';
      process.env.FRONTEND_URL = 'https://app.example.com';
    });
    afterAll(() => {
      process.env.EARLY_ACCESS_NOTIFY_EMAIL = env;
    });

    it('emails the admin once for a new tester request', async () => {
      const { service, email } = make();
      await service.request('o', 'u', { provider: 'facebook' }, 'Acme <b>');
      expect(email.sendEmailSync).toHaveBeenCalledTimes(1);
      const [to, subject, html] = email.sendEmailSync.mock.calls[0];
      expect(to).toBe('admin@x.com');
      expect(subject).toContain('tester');
      expect(html).toContain('Acme &lt;b&gt;');
      expect(html).toContain('https://app.example.com/admin/early-access');
    });

    it('stays quiet for waitlist requests', async () => {
      const { service, email } = make();
      await service.request('o', 'u', { provider: 'mewe' }, 'Acme');
      expect(email.sendEmailSync).not.toHaveBeenCalled();
    });

    it('stays quiet when the tester request already exists', async () => {
      const { service, repo, email } = make();
      repo.findForOrganization.mockResolvedValue({ id: '1' });
      await service.request('o', 'u', { provider: 'facebook', newsletter: true });
      expect(repo.upsertRequest).toHaveBeenCalled();
      expect(email.sendEmailSync).not.toHaveBeenCalled();
    });

    it('sends nothing when EARLY_ACCESS_NOTIFY_EMAIL is unset', async () => {
      delete process.env.EARLY_ACCESS_NOTIFY_EMAIL;
      const { service, email } = make();
      await service.request('o', 'u', { provider: 'facebook' }, 'Acme');
      expect(email.sendEmailSync).not.toHaveBeenCalled();
    });

    it('still saves the request when the email fails', async () => {
      const { service, email } = make();
      email.sendEmailSync.mockRejectedValueOnce(new Error('resend down'));
      await expect(
        service.request('o', 'u', { provider: 'facebook' }, 'Acme')
      ).resolves.toMatchObject({ id: '1', kind: 'tester' });
    });
  });

  describe('approval email', () => {
    const tester = {
      id: '1',
      kind: 'tester',
      provider: 'facebook',
      user: { email: 't@x.com' },
    };

    it('emails the requester when the row moves to approved', async () => {
      process.env.FRONTEND_URL = 'https://app.example.com';
      const { service, repo, email } = make();
      repo.findById.mockResolvedValue(tester);
      await service.approve('1');
      expect(email.sendEmailSync).toHaveBeenCalledTimes(1);
      const [to, subject, html] = email.sendEmailSync.mock.calls[0];
      expect(to).toBe('t@x.com');
      expect(subject).toBe("You're approved to test MeWe on ViralGenHub");
      expect(html).toContain('https://app.example.com/launches?early=facebook');
    });

    it('sends only once: a second Approve changes nothing and emails nobody', async () => {
      const { service, repo, email } = make();
      repo.findById.mockResolvedValue(tester);
      repo.approveIfRequested
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);
      await service.approve('1');
      await expect(service.approve('1')).resolves.toMatchObject({
        status: 'approved',
      });
      expect(email.sendEmailSync).toHaveBeenCalledTimes(1);
    });

    it('still approves when the email fails', async () => {
      const { service, repo, email } = make();
      repo.findById.mockResolvedValue(tester);
      email.sendEmailSync.mockRejectedValueOnce(new Error('resend down'));
      await expect(service.approve('1')).resolves.toMatchObject({
        status: 'approved',
      });
      expect(repo.approveIfRequested).toHaveBeenCalledWith('1');
    });
  });

  it('counts only untouched requests as waiting', async () => {
    const { service, repo } = make();
    repo.listAll.mockResolvedValue([
      { id: 'a', provider: 'skool', kind: 'tester', status: 'approved' },
      { id: 'b', provider: 'skool', kind: 'tester', status: 'requested' },
      { id: 'c', provider: 'mewe', kind: 'waitlist', status: 'notified' },
    ]);
    const { providers } = await service.adminList();
    expect(providers.map((p) => [p.provider, p.waiting])).toEqual([
      ['skool', 1],
      ['mewe', 0],
    ]);
    expect(providers[0].requests).toHaveLength(2);
  });
});
