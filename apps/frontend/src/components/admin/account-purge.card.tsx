'use client';

import React, { FC } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

// Shape of GET /admin/account-purge (AccountPurgeService.getStats).
interface AccountPurgeResponse {
  days: number;
  waiting: number;
  due: number;
  purged: number;
  nextPurgeAt: string | null;
  lastPurgedAt: string | null;
}

const useAccountPurge = () => {
  const fetch = useFetch();
  return useSWR<AccountPurgeResponse>(
    '/admin/account-purge',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load the account purge');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const day = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

// Deleted accounts (#393): workspaces whose posts, media, comments and
// channels are waiting for the 30-day hard deletion, and how many are done.
export const AccountPurgeCard: FC = () => {
  const { data, error, isLoading } = useAccountPurge();

  return (
    <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[8px]">
      <div className="flex items-center justify-between gap-[8px]">
        <div className="text-[12px] opacity-70">
          Deleted accounts: content deletion
          {data ? ` (after ${data.days} days)` : ''}
        </div>
        {!!data?.due && (
          <div className="text-[12px] px-[8px] rounded-[4px] bg-red-600 text-white">
            {data.due} overdue
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="text-[13px] opacity-70">Loading...</div>
      ) : error || !data ? (
        <div className="text-[13px] text-red-400">
          Failed to load the deletion queue.
        </div>
      ) : (
        <>
          <div className="text-[28px] font-[600]">
            {data.waiting.toLocaleString()}{' '}
            <span className="text-[14px] font-[400] opacity-70">
              {data.waiting === 1 ? 'workspace waiting' : 'workspaces waiting'}
            </span>
          </div>
          <div className="text-[13px] opacity-70">
            {data.purged.toLocaleString()} deleted so far
            {data.lastPurgedAt ? `, last on ${day(data.lastPurgedAt)}` : ''}.
            {data.nextPurgeAt ? ` Next due ${day(data.nextPurgeAt)}.` : ''}
            {data.due
              ? ' Overdue ones are retried by the daily job; check the logs if this stays above 0.'
              : ''}
          </div>
        </>
      )}
    </div>
  );
};
