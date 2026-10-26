'use client';

import React, { FC } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

// Shape of GET /admin/settings-check (AdminSettingsService.check).
interface SettingCheck {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  fix?: string;
}

const useSettingsCheck = () => {
  const fetch = useFetch();
  return useSWR<{ checks: SettingCheck[] }>(
    '/admin/settings-check',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load the settings check');
      }
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const dot = {
  ok: 'bg-green-500',
  warn: 'bg-amber-500',
  error: 'bg-red-500',
};

export const SettingsCheckCard: FC = () => {
  const { data, error, isLoading } = useSettingsCheck();
  return (
    <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[10px]">
      <div className="text-[12px] opacity-70">Security and provider settings</div>
      {isLoading ? (
        <div className="text-[13px] opacity-70">Loading...</div>
      ) : error || !data ? (
        <div className="text-[13px] text-red-400">
          Failed to load the settings check.
        </div>
      ) : (
        data.checks.map((c) => (
          <div key={c.key} className="flex items-start gap-[10px]">
            <div
              className={clsx('w-[10px] h-[10px] rounded-full mt-[5px] shrink-0', dot[c.status])}
              aria-label={c.status}
            />
            <div className="flex flex-col">
              <div className="text-[14px] font-[600]">{c.label}</div>
              <div className="text-[13px] opacity-70">{c.detail}</div>
              {c.status !== 'ok' && c.fix && (
                <code className="text-[12px] opacity-90">{c.fix}</code>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
