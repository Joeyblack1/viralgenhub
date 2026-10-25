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
    setStatus: jest.fn().mockResolvedValue({ id: '1', status: 'approved' }),
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

  it('rejects providers that are not hidden tiers', () => {
    const { service, repo } = make();
    expect(() => service.request('o', 'u', { provider: 'x' })).toThrow();
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
    repo.findById.mockResolvedValueOnce({ id: '1', kind: 'tester' });
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
});
