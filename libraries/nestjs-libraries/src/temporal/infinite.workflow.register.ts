import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';

@Injectable()
export class InfiniteWorkflowRegister implements OnModuleInit {
  constructor(private _temporalService: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (!!process.env.RUN_CRON) {
      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('missingPostWorkflow', {
            workflowId: 'missing-post-workflow',
            taskQueue: 'main',
          });
      } catch (err) {}
    }

    // Account deletion (#393): the daily purge of deleted accounts'
    // workspaces runs whether or not RUN_CRON is set (the privacy policy
    // promises it). The fixed workflow id keeps it to one run; starting it
    // again while it runs fails and is ignored. ACCOUNT_PURGE=off stops it
    // from being started.
    if (process.env.ACCOUNT_PURGE !== 'off') {
      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('accountPurgeWorkflow', {
            workflowId: 'account-purge-workflow',
            taskQueue: 'main',
          });
      } catch (err) {}
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [InfiniteWorkflowRegister],
  get exports() {
    return this.providers;
  },
})
export class InfiniteWorkflowRegisterModule {}
