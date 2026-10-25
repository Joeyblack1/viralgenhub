'use client';

import React, { FC } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

// Shape of GET /admin/x-spend (AdminStatsService.getXSpend).
interface XSpendResponse {
  month: string;
  posts: number;
  linkPosts: number;
  estimatedUsd: number;
  budgetUsd: number;
  pauseAtUsd: number;
}

const useXSpend = () => {
  const fetch = useFetch();
  return useSWR<XSpendResponse>(
    '/admin/x-spend',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load X spend');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const usd = (value: number) => `$${value.toFixed(2)}`;

export const XSpendCard: FC = () => {
  const { data, error, isLoading } = useXSpend();
  const paused = !!data && data.estimatedUsd >= data.pauseAtUsd;
  const percent = data
    ? Math.min(100, Math.round((data.estimatedUsd / data.budgetUsd) * 100))
    : 0;

  return (
    <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[8px]">
      <div className="flex items-center justify-between gap-[8px]">
        <div className="text-[12px] opacity-70">
          X API spend (estimate){data ? `, ${data.month}` : ''}
        </div>
        {paused && (
          <div className="text-[12px] px-[8px] rounded-[4px] bg-red-600 text-white">
            X posting paused
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="text-[13px] opacity-70">Loading...</div>
      ) : error || !data ? (
        <div className="text-[13px] text-red-400">
          Failed to load the X spend.
        </div>
      ) : (
        <>
          <div className="text-[28px] font-[600]">
            {usd(data.estimatedUsd)}{' '}
            <span className="text-[14px] font-[400] opacity-70">
              of {usd(data.budgetUsd)}
            </span>
          </div>
          <div className="h-[6px] rounded-full bg-tableBorder overflow-hidden">
            <div
              className={`h-full ${paused ? 'bg-red-500' : 'bg-forth'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="text-[13px] opacity-70">
            {data.posts.toLocaleString()} posts, {data.linkPosts.toLocaleString()}{' '}
            with a link. Posting pauses at {usd(data.pauseAtUsd)}.
          </div>
        </>
      )}
    </div>
  );
};
