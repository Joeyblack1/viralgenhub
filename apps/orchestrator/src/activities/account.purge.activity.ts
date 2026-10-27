import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AccountPurgeService } from '@gitroom/nestjs-libraries/database/prisma/account-purge/account-purge.service';

@Injectable()
@Activity()
export class AccountPurgeActivity {
  constructor(private _accountPurgeService: AccountPurgeService) {}

  // Hard-deletes the workspaces of deleted accounts whose 30 days are over
  @ActivityMethod()
  async purgeDeletedAccounts() {
    return this._accountPurgeService.purgeDue();
  }
}
