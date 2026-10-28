import 'reflect-metadata';
// the real providers pull in native modules this spec does not need
jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));
jest.mock('@gitroom/nestjs-libraries/integrations/social/nostr.provider', () => ({
  NostrProvider: class {
    identifier = 'nostr';
  },
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));

import { IntegrationManager } from './integration.manager';

describe('IntegrationManager tiers', () => {
  const saved = { ...process.env };
  const manager = new IntegrationManager();

  beforeEach(() => {
    process.env.HIDDEN_PROVIDERS = 'facebook,instagram,mewe';
    process.env.PREVIEW_PROVIDERS = 'facebook,instagram';
    process.env.COMING_SOON_PROVIDERS = 'mewe';
    process.env.PREVIEW_ORGS = 'org-env';
  });
  afterAll(() => {
    process.env = saved;
  });

  it('lets an org listed in PREVIEW_ORGS connect a preview provider', () => {
    expect(manager.isAvailableTo('facebook', 'org-env')).toBe(true);
  });

  it('lets an org approved in the database connect only that provider', () => {
    expect(manager.isAvailableTo('facebook', 'org-db', ['facebook'])).toBe(true);
    expect(manager.isAvailableTo('instagram', 'org-db', ['facebook'])).toBe(
      false
    );
  });

  it('refuses a non-tester a hidden provider, and open ones stay open', () => {
    expect(manager.isAvailableTo('facebook', 'org-x')).toBe(false);
    expect(manager.isAvailableTo('facebook')).toBe(false);
    expect(manager.isAvailableTo('x', 'org-x')).toBe(true);
  });

  it('never opens a coming-soon provider, even to testers', () => {
    expect(manager.isAvailableTo('mewe', 'org-env', ['mewe'])).toBe(false);
  });

  it('describes both tiers with testerAccess, comingSoon, waiting and myRequest', async () => {
    const { social } = await manager.getPreviewIntegrations(
      'org-db',
      ['facebook'],
      { instagram: 3, mewe: 7 },
      { mewe: 'requested' }
    );
    const by = (id: string) => social.find((p) => p.identifier === id) as any;
    expect(by('facebook').testerAccess).toBe(true);
    expect(by('instagram')).toMatchObject({ testerAccess: false, waiting: 3 });
    expect(by('mewe')).toMatchObject({
      comingSoon: true,
      waiting: 7,
      myRequest: 'requested',
    });
    expect(by('mewe').testerAccess).toBeUndefined();
    expect(social.map((p) => p.identifier).sort()).toEqual([
      'facebook',
      'instagram',
      'mewe',
    ]);
  });

  describe('STAFF_PROVIDERS', () => {
    beforeEach(() => {
      process.env.HIDDEN_PROVIDERS = 'facebook,instagram,threads,mewe';
      process.env.PREVIEW_PROVIDERS = '';
      process.env.COMING_SOON_PROVIDERS = 'facebook,instagram,threads,mewe';
      process.env.STAFF_PROVIDERS = 'facebook,instagram';
    });
    afterEach(() => {
      delete process.env.STAFF_PROVIDERS;
    });

    it('lets a PREVIEW_ORGS workspace connect a staff provider', () => {
      expect(manager.isAvailableTo('instagram', 'org-env')).toBe(true);
    });

    it('refuses other workspaces, even approved or anonymous ones', () => {
      expect(manager.isAvailableTo('instagram', 'org-x')).toBe(false);
      expect(manager.isAvailableTo('instagram', 'org-db', ['instagram'])).toBe(
        false
      );
      expect(manager.isAvailableTo('instagram')).toBe(false);
    });

    it('does not open an id that is not in STAFF_PROVIDERS', () => {
      expect(manager.isAvailableTo('threads', 'org-env')).toBe(false);
      expect(manager.isAvailableTo('mewe', 'org-env')).toBe(false);
    });

    it('needs the provider to be hidden', () => {
      process.env.HIDDEN_PROVIDERS = 'mewe';
      expect(manager.isStaffProvider('instagram', 'org-env')).toBe(false);
    });

    it('shows staff a connectable tile and everyone else the unchanged tier', async () => {
      const staff = await manager.getPreviewIntegrations('org-env');
      const other = await manager.getPreviewIntegrations('org-x');
      const find = (r: any, id: string) =>
        r.social.find((p: any) => p.identifier === id);
      expect(find(staff, 'instagram')).toMatchObject({
        testerAccess: true,
        staff: true,
      });
      expect(find(staff, 'instagram').comingSoon).toBeUndefined();
      expect(find(staff, 'threads')).toMatchObject({ comingSoon: true });
      expect(find(other, 'instagram')).toMatchObject({ comingSoon: true });
      expect(find(other, 'instagram').staff).toBeUndefined();
      expect(find(other, 'instagram').testerAccess).toBeUndefined();
    });

    it('keeps the public tiers unchanged for isComingSoonProvider', () => {
      expect(manager.isComingSoonProvider('instagram')).toBe(true);
      expect(manager.isPreviewListed('instagram')).toBe(false);
    });

    it('does nothing when the env list is empty', async () => {
      process.env.STAFF_PROVIDERS = '';
      expect(manager.isAvailableTo('instagram', 'org-env')).toBe(false);
      const r: any = await manager.getPreviewIntegrations('org-env');
      expect(r.social.every((p: any) => !p.staff && p.comingSoon)).toBe(true);
    });
  });
});
