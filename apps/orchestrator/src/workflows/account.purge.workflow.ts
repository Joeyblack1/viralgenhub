import {
  continueAsNew,
  proxyActivities,
  sleep,
} from '@temporalio/workflow';
import { AccountPurgeActivity } from '@gitroom/orchestrator/activities/account.purge.activity';

const { purgeDeletedAccounts } = proxyActivities<AccountPurgeActivity>({
  startToCloseTimeout: '30 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '5 minutes',
  },
});

// Account deletion (#393): once a day, hard-delete the workspaces of deleted
// accounts whose 30 days are over. Started by InfiniteWorkflowRegister with a
// fixed id. A failed day is retried the next day: the failure is caught so
// the loop never ends, and the work is idempotent (purgedAt).
export async function accountPurgeWorkflow() {
  for (let day = 0; day < 7; day++) {
    try {
      await purgeDeletedAccounts();
    } catch (err) {
      /** retried tomorrow */
    }
    await sleep('1 day');
  }

  // keep the history small
  return await continueAsNew<typeof accountPurgeWorkflow>();
}
