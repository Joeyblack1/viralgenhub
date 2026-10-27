import 'reflect-metadata';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/account-purge/account-purge.repository',
  () => ({ AccountPurgeRepository: class {} })
);

import {
  AccountPurgeService,
  localUploadFile,
} from './account-purge.service';
import { accountPurgeDate, ACCOUNT_PURGE_DAYS } from './account-purge.config';

// In-memory stand-in with the same selection rules as the Prisma queries:
// due = purgeAfter <= now, not purged yet, workspace soft-deleted.
interface FakeOrg {
  id: string;
  deletedAt: Date | null;
  purgeAfter: Date | null;
  purgedAt: Date | null;
  liveMembers: number;
  files: string[];
  fail?: boolean;
}

const fakeRepository = (orgs: FakeOrg[], sharedFiles: string[] = []) => {
  const purged: string[] = [];
  const repo = {
    findDue: jest.fn(async (now: Date) =>
      orgs
        .filter(
          (o) =>
            o.purgeAfter &&
            o.purgeAfter.getTime() <= now.getTime() &&
            !o.purgedAt &&
            o.deletedAt
        )
        .map((o) => ({ id: o.id, purgeAfter: o.purgeAfter }))
    ),
    countLiveMembers: jest.fn(
      async (id: string) => orgs.find((o) => o.id === id)!.liveMembers
    ),
    countMediaUsingFile: jest.fn(async (url: string) =>
      sharedFiles.includes(url) ? 1 : 0
    ),
    purgeOrganization: jest.fn(async (id: string, now: Date) => {
      const org = orgs.find((o) => o.id === id)!;
      if (org.fail) {
        throw new Error('foreign key');
      }
      org.purgedAt = now;
      purged.push(id);
      return { counts: { posts: 3 } as any, files: org.files };
    }),
    stats: jest.fn(async (now: Date) => ({
      waiting: orgs.filter(
        (o) => o.purgeAfter && o.purgeAfter > now && !o.purgedAt
      ).length,
      due: orgs.filter(
        (o) => o.purgeAfter && o.purgeAfter <= now && !o.purgedAt
      ).length,
      purged: orgs.filter((o) => o.purgedAt).length,
      nextPurgeAt: null,
      lastPurgedAt: null,
    })),
  };
  return { repo, purged };
};

const DELETED = new Date('2026-10-27T12:00:00Z');
const day = (n: number) =>
  new Date(DELETED.getTime() + n * 24 * 60 * 60 * 1000);

describe('account purge (#393)', () => {
  let uploads: string;
  const env = { ...process.env };

  beforeEach(() => {
    uploads = mkdtempSync(join(tmpdir(), 'vgh-purge-'));
    process.env.STORAGE_PROVIDER = 'local';
    process.env.UPLOAD_DIRECTORY = uploads;
    process.env.FRONTEND_URL = 'https://app.test';
    jest.useFakeTimers().setSystemTime(DELETED);
  });

  afterEach(() => {
    jest.useRealTimers();
    rmSync(uploads, { recursive: true, force: true });
    process.env = { ...env };
  });

  const upload = (name: string) => {
    mkdirSync(join(uploads, '2026/10/27'), { recursive: true });
    writeFileSync(join(uploads, '2026/10/27', name), 'x');
    return {
      url: `https://app.test/uploads/2026/10/27/${name}`,
      file: join(uploads, '2026/10/27', name),
    };
  };

  it('schedules the purge 30 days after the deletion', () => {
    expect(ACCOUNT_PURGE_DAYS).toBe(30);
    expect(accountPurgeDate(new Date()).toISOString()).toBe(
      '2026-11-26T12:00:00.000Z'
    );
  });

  it('purges nothing before day 30 and the deleted workspace on day 30, using the clock', async () => {
    const photo = upload('a.png');
    const orgs: FakeOrg[] = [
      {
        id: 'deleted-account-org',
        deletedAt: DELETED,
        purgeAfter: accountPurgeDate(new Date()),
        purgedAt: null,
        liveMembers: 0,
        files: [photo.url],
      },
    ];
    const { repo, purged } = fakeRepository(orgs);
    const service = new AccountPurgeService(repo as any);

    jest.setSystemTime(day(29));
    await expect(service.purgeDue()).resolves.toEqual({
      purged: 0,
      skipped: 0,
      failed: 0,
      files: 0,
    });
    expect(repo.purgeOrganization).not.toHaveBeenCalled();
    expect(existsSync(photo.file)).toBe(true);

    jest.setSystemTime(day(30));
    await expect(service.purgeDue()).resolves.toEqual({
      purged: 1,
      skipped: 0,
      failed: 0,
      files: 1,
    });
    expect(purged).toEqual(['deleted-account-org']);
    expect(repo.purgeOrganization.mock.calls[0][1].toISOString()).toBe(
      day(30).toISOString()
    );
    expect(existsSync(photo.file)).toBe(false);

    // idempotent: the next day finds nothing left to do
    jest.setSystemTime(day(31));
    await expect(service.purgeDue()).resolves.toMatchObject({ purged: 0 });
    expect(repo.purgeOrganization).toHaveBeenCalledTimes(1);
  });

  it('never touches workspaces of users who did not delete their account', async () => {
    const kept = upload('kept.png');
    const orgs: FakeOrg[] = [
      // live workspace
      { id: 'live', deletedAt: null, purgeAfter: null, purgedAt: null, liveMembers: 1, files: [kept.url] },
      // workspace deleted some other way (no purge mark)
      { id: 'soft-deleted', deletedAt: DELETED, purgeAfter: null, purgedAt: null, liveMembers: 0, files: [kept.url] },
      // marked, but someone with a live account is still a member
      { id: 'still-used', deletedAt: DELETED, purgeAfter: day(30), purgedAt: null, liveMembers: 1, files: [kept.url] },
    ];
    const { repo } = fakeRepository(orgs);
    const service = new AccountPurgeService(repo as any);

    jest.setSystemTime(day(400));
    await expect(service.purgeDue()).resolves.toEqual({
      purged: 0,
      skipped: 1,
      failed: 0,
      files: 0,
    });
    expect(repo.purgeOrganization).not.toHaveBeenCalled();
    expect(existsSync(kept.file)).toBe(true);
  });

  it('a failing workspace does not stop the others and is retried the next day', async () => {
    const orgs: FakeOrg[] = [
      { id: 'bad', deletedAt: DELETED, purgeAfter: day(30), purgedAt: null, liveMembers: 0, files: [], fail: true },
      { id: 'good', deletedAt: DELETED, purgeAfter: day(30), purgedAt: null, liveMembers: 0, files: [] },
    ];
    const { repo, purged } = fakeRepository(orgs);
    const service = new AccountPurgeService(repo as any);

    jest.setSystemTime(day(30));
    await expect(service.purgeDue()).resolves.toMatchObject({
      purged: 1,
      failed: 1,
    });
    expect(purged).toEqual(['good']);

    orgs[0].fail = false;
    jest.setSystemTime(day(31));
    await expect(service.purgeDue()).resolves.toMatchObject({ purged: 1 });
    expect(purged).toEqual(['good', 'bad']);
  });

  it('keeps a file another media row still uses, and never leaves the upload folder', async () => {
    const shared = upload('shared.png');
    const own = upload('own.png');
    const outside = join(uploads, '..', `outside-${Date.now()}.txt`);
    writeFileSync(outside, 'x');
    const orgs: FakeOrg[] = [
      {
        id: 'o',
        deletedAt: DELETED,
        purgeAfter: day(30),
        purgedAt: null,
        liveMembers: 0,
        files: [
          shared.url,
          own.url,
          'https://app.test/uploads/../' + outside.split('/').pop(),
          'https://elsewhere.test/uploads/2026/10/27/own.png',
          'https://app.test/uploads/2026/10/27/already-gone.png',
        ],
      },
    ];
    const { repo } = fakeRepository(orgs, [shared.url]);
    const service = new AccountPurgeService(repo as any);

    jest.setSystemTime(day(30));
    const run = await service.purgeDue();
    expect(existsSync(shared.file)).toBe(true);
    expect(existsSync(own.file)).toBe(false);
    expect(existsSync(outside)).toBe(true);
    // own.png + the already-missing file
    expect(run.files).toBe(2);
    rmSync(outside, { force: true });
  });

  it('localUploadFile maps only local upload URLs inside the folder', () => {
    expect(localUploadFile('https://app.test/uploads/2026/a.png')).toBe(
      join(uploads, '2026/a.png')
    );
    expect(localUploadFile('https://app.test/uploads/../etc/passwd')).toBe(
      undefined
    );
    expect(localUploadFile('https://app.test/uploads/%2e%2e/x')).toBe(undefined);
    expect(localUploadFile('/etc/passwd')).toBe(undefined);
    process.env.STORAGE_PROVIDER = 'cloudflare';
    expect(localUploadFile('https://app.test/uploads/2026/a.png')).toBe(
      undefined
    );
  });

  it('reports counts for /admin', async () => {
    const orgs: FakeOrg[] = [
      { id: 'a', deletedAt: DELETED, purgeAfter: day(30), purgedAt: null, liveMembers: 0, files: [] },
      { id: 'b', deletedAt: DELETED, purgeAfter: day(-1), purgedAt: null, liveMembers: 0, files: [] },
      { id: 'c', deletedAt: DELETED, purgeAfter: day(-40), purgedAt: day(-10), liveMembers: 0, files: [] },
    ];
    const { repo } = fakeRepository(orgs);
    const service = new AccountPurgeService(repo as any);
    await expect(service.getStats()).resolves.toMatchObject({
      days: 30,
      waiting: 1,
      due: 1,
      purged: 1,
    });
  });
});
