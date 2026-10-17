import crypto from 'crypto';
import { IntegrationRepository } from './integration.repository';
import {
  decryptToken,
  encryptToken,
  isEncryptedToken,
} from '@gitroom/helpers/auth/token.encryption';

// the storage backends pull in an ESM-only dependency jest cannot load
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

// Mocked Prisma: nothing connects. The row mock plays the database, i.e. it
// returns whatever was last written, so the spec sees what is stored.
const build = () => {
  const integration: any = {
    upsert: jest.fn(async ({ create }: any) => ({ id: 'i1', ...create })),
    updateMany: jest.fn(async () => ({ count: 1 })),
    update: jest.fn(async ({ data }: any) => ({ id: 'i1', ...data })),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };
  const plugs: any = { model: { plugs: { findFirst: jest.fn() } } };
  const repo = new IntegrationRepository(
    { model: { integration } } as any,
    { model: { post: {} } } as any,
    plugs,
    { model: {} } as any,
    { model: {} } as any,
    { model: {} } as any
  );
  return { repo, integration, plugs };
};

const create = (repo: IntegrationRepository, oneTime = false) =>
  repo.createOrUpdateIntegration(
    undefined,
    oneTime,
    'org',
    'name',
    undefined,
    'social',
    'internal',
    'x',
    'access-token',
    'refresh-token',
    3600
  );

describe('IntegrationRepository token encryption', () => {
  const original = process.env.TOKEN_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  });
  afterAll(() => {
    if (original === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = original;
    }
  });

  it('stores token and refreshToken encrypted on create and update', async () => {
    const { repo, integration } = build();
    await create(repo);
    const args = integration.upsert.mock.calls[0][0];
    for (const data of [args.create, args.update]) {
      expect(isEncryptedToken(data.token)).toBe(true);
      expect(isEncryptedToken(data.refreshToken)).toBe(true);
      expect(decryptToken(data.token)).toBe('access-token');
      expect(decryptToken(data.refreshToken)).toBe('refresh-token');
    }
    expect(JSON.stringify(args)).not.toContain('access-token');
    expect(JSON.stringify(args)).not.toContain('refresh-token');
  });

  it('returns plaintext tokens to the caller of the upsert', async () => {
    const { repo } = build();
    const res = await create(repo);
    expect(res.token).toBe('access-token');
    expect(res.refreshToken).toBe('refresh-token');
  });

  it('keeps an empty refresh token out of the update', async () => {
    const { repo, integration } = build();
    await repo.createOrUpdateIntegration(
      undefined, false, 'org', 'n', undefined, 'social', 'internal', 'x', 'access-token'
    );
    expect(integration.upsert.mock.calls[0][0].update).not.toHaveProperty(
      'refreshToken'
    );
  });

  it('encrypts the sibling channels of a one-time token provider', async () => {
    const { repo, integration } = build();
    integration.findFirst.mockResolvedValue({ rootInternalId: 'root' });
    await create(repo, true);
    const data = integration.updateMany.mock.calls[0][0].data;
    expect(decryptToken(data.token)).toBe('access-token');
    expect(decryptToken(data.refreshToken)).toBe('refresh-token');
  });

  it('writes plaintext when no key is set', async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    const { repo, integration } = build();
    await create(repo);
    const args = integration.upsert.mock.calls[0][0];
    expect(args.create.token).toBe('access-token');
    expect(args.update.refreshToken).toBe('refresh-token');
  });

  it('encrypts tokens passed through updateIntegration', async () => {
    const { repo, integration } = build();
    integration.findUnique = jest.fn().mockResolvedValue(null);
    const res = await repo.updateIntegration('i1', {
      token: 'new',
      internalId: 'x',
      organizationId: 'org',
    });
    const data = integration.update.mock.calls[0][0].data;
    expect(isEncryptedToken(data.token)).toBe(true);
    expect(res.token).toBe('new');
  });

  it('decrypts on every read that returns a full row', async () => {
    const { repo, integration } = build();
    const row = () => ({
      id: 'i1',
      token: encryptToken('t'),
      refreshToken: encryptToken('r'),
    });
    integration.findFirst.mockImplementation(async () => row());
    integration.findMany.mockImplementation(async () => [row(), row()]);

    const one = [
      await repo.getIntegrationById('org', 'i1'),
      await repo.getIntegrationByInternalId('org', 'internal'),
    ];
    for (const r of one) {
      expect(r).toMatchObject({ token: 't', refreshToken: 'r' });
    }
    for (const list of [
      await repo.needsToBeRefreshed(),
      await repo.getIntegrationsList('org'),
    ]) {
      expect(list).toHaveLength(2);
      expect(list[0]).toMatchObject({ token: 't', refreshToken: 'r' });
    }
  });

  it('still reads rows stored as plaintext', async () => {
    const { repo, integration } = build();
    integration.findFirst.mockResolvedValue({ id: 'i1', token: 'old', refreshToken: null });
    expect(await repo.getIntegrationById('org', 'i1')).toMatchObject({
      token: 'old',
      refreshToken: null,
    });
  });

  it('returns null for a missing row', async () => {
    const { repo, integration } = build();
    integration.findFirst.mockResolvedValue(null);
    expect(await repo.getIntegrationById('org', 'nope')).toBeNull();
  });

  it('decrypts the integration of a plug', async () => {
    const { repo, plugs } = build();
    plugs.model.plugs.findFirst.mockResolvedValue({
      id: 'p',
      integration: { id: 'i1', token: encryptToken('t'), refreshToken: null },
    });
    const plug = await repo.getPlug('p');
    expect(plug?.integration.token).toBe('t');
  });
});
