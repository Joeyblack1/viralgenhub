import { Injectable, Logger } from '@nestjs/common';
import { unlink } from 'fs/promises';
import { resolve, sep } from 'path';
import { AccountPurgeRepository } from '@gitroom/nestjs-libraries/database/prisma/account-purge/account-purge.repository';
import { ACCOUNT_PURGE_DAYS } from '@gitroom/nestjs-libraries/database/prisma/account-purge/account-purge.config';

export interface AccountPurgeRun {
  purged: number;
  skipped: number;
  failed: number;
  files: number;
}

// A public media URL on this app's local upload store resolved to the file
// on disk; undefined for anything else (another host, cloud storage, or a
// path that would leave the upload directory).
export const localUploadFile = (url: string): string | undefined => {
  const root = process.env.UPLOAD_DIRECTORY;
  if (
    (process.env.STORAGE_PROVIDER || 'local') !== 'local' ||
    !root ||
    !url
  ) {
    return undefined;
  }
  const publicPrefix = process.env.FRONTEND_URL + '/uploads/';
  if (!url.startsWith(publicPrefix)) {
    return undefined;
  }
  const base = resolve(root);
  let relative: string;
  try {
    relative = decodeURIComponent(
      url.slice(publicPrefix.length).split(/[?#]/)[0]
    );
  } catch (e) {
    return undefined;
  }
  const file = resolve(base, relative);
  return file.startsWith(base + sep) ? file : undefined;
};

// Daily hard deletion of the workspaces of deleted accounts (#393). Account
// deletion removes the name, email, password and channel tokens at once and
// marks each workspace the account owned with purgeAfter (30 days later);
// this deletes those workspaces' posts, comments, media (rows and local
// files), channels and the rest of their content once the date has passed.
// A workspace without that mark is never touched.
@Injectable()
export class AccountPurgeService {
  private readonly _logger = new Logger(AccountPurgeService.name);

  constructor(private _repository: AccountPurgeRepository) {}

  async purgeDue(now: Date = new Date()): Promise<AccountPurgeRun> {
    const run: AccountPurgeRun = { purged: 0, skipped: 0, failed: 0, files: 0 };
    const due = await this._repository.findDue(now);

    for (const org of due) {
      try {
        if (await this._repository.countLiveMembers(org.id)) {
          run.skipped++;
          this._logger.warn(
            `Account purge: workspace ${org.id} still has a member with a live account, not purged`
          );
          continue;
        }

        const { counts, files } = await this._repository.purgeOrganization(
          org.id,
          now
        );
        run.purged++;
        run.files += await this.removeFiles(files);
        this._logger.log(
          `Account purge: workspace ${org.id} purged ${JSON.stringify(counts)}`
        );
      } catch (err) {
        run.failed++;
        this._logger.error(
          `Account purge: workspace ${org.id} failed: ${
            (err as Error)?.message || err
          }`
        );
      }
    }

    return run;
  }

  // the files go after their rows: a file another media row still uses is
  // kept, a file that is already gone counts as removed
  private async removeFiles(urls: string[]) {
    let removed = 0;
    for (const url of Array.from(new Set(urls))) {
      const file = localUploadFile(url);
      if (!file) {
        continue;
      }
      try {
        if (await this._repository.countMediaUsingFile(url)) {
          continue;
        }
        await unlink(file);
        removed++;
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
          removed++;
          continue;
        }
        this._logger.error(
          `Account purge: could not remove ${file}: ${(err as Error)?.message}`
        );
      }
    }
    return removed;
  }

  // For /admin: counts only, no names or ids
  async getStats(now: Date = new Date()) {
    return {
      days: ACCOUNT_PURGE_DAYS,
      ...(await this._repository.stats(now)),
    };
  }
}
