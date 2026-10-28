'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

interface EarlyAccessRow {
  id: string;
  provider: string;
  kind: 'tester' | 'waitlist';
  note: string | null;
  newsletter: boolean;
  status: 'requested' | 'approved' | 'notified';
  createdAt: string;
  organization: { id: string; name: string };
  user: { email: string };
}

// What the platform itself needs before an approved tester can connect
// (early.access.platform.ts on the backend)
interface PlatformStep {
  kind: 'none' | 'manual' | 'limited';
  adminText: string;
  adminLink?: string;
  adminLinkLabel?: string;
}

interface EarlyAccessResponse {
  providers: Array<{
    provider: string;
    waiting: number;
    requests: EarlyAccessRow[];
    platformStep?: PlatformStep;
    autoApprove?: boolean;
  }>;
}

const PlatformStepNote: FC<{ step?: PlatformStep; autoApprove?: boolean }> = ({
  step,
  autoApprove,
}) => {
  if (!step) {
    return null;
  }
  return (
    <div
      className={
        step.kind === 'manual'
          ? 'text-[13px] rounded-[6px] p-[8px] border border-amber-500/60 bg-amber-500/10'
          : 'text-[13px] opacity-80'
      }
    >
      <span className="font-[600]">
        {step.kind === 'manual'
          ? 'Platform step before approving: '
          : step.kind === 'limited'
          ? 'Platform limit: '
          : ''}
      </span>
      {step.adminText}{' '}
      {!!step.adminLink && (
        <a
          href={step.adminLink}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {step.adminLinkLabel || 'Open'}
        </a>
      )}
      {autoApprove && (
        <span className="block mt-[4px] opacity-80">
          Auto-approved on request (EARLY_ACCESS_AUTO_APPROVE).
        </span>
      )}
    </div>
  );
};

// Shared by this page and the /admin index card: one SWR key, so Approve's
// mutate() refreshes the heading counts and the card together.
export const useEarlyAccessList = () => {
  const fetch = useFetch();
  return useSWR<EarlyAccessResponse>('/admin/early-access', async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Failed to load early access requests');
    }
    return res.json();
  });
};

export const AdminEarlyAccessComponent: FC = () => {
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, isLoading, error, mutate } = useEarlyAccessList();
  const [busy, setBusy] = useState<string | null>(null);

  const post = useCallback(
    async (key: string, url: string, ok: (body: any) => string) => {
      setBusy(key);
      try {
        const res = await fetch(url, { method: 'POST' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toaster.show(body?.message || 'Request failed', 'warning');
          return;
        }
        toaster.show(ok(body), 'success');
        await mutate();
      } finally {
        setBusy(null);
      }
    },
    [fetch, mutate, toaster]
  );

  if (!user?.isSuperAdmin) {
    return (
      <div className="text-textColor p-[20px]">
        You do not have access to this page.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px] text-textColor">
      <div className="text-[20px] font-[600]">Early access</div>
      {isLoading && <LoadingComponent />}
      {!!error && <div className="text-red-500">Could not load requests.</div>}
      {data && data.providers.length === 0 && (
        <div className="opacity-70">No requests yet.</div>
      )}
      {data?.providers.map((group) => {
        const hasWaitlist = group.requests.some((r) => r.kind === 'waitlist');
        return (
          <div
            key={group.provider}
            className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[12px] flex flex-col gap-[10px]"
          >
            <div className="flex items-center justify-between gap-[12px]">
              <div className="text-[16px] font-[600]">
                {group.provider}{' '}
                <span className="text-[13px] font-[400] opacity-70">
                  {group.waiting} waiting
                </span>
              </div>
              {hasWaitlist && (
                <Button
                  type="button"
                  loading={busy === `notify:${group.provider}`}
                  onClick={() =>
                    post(
                      `notify:${group.provider}`,
                      `/admin/early-access/notify/${encodeURIComponent(
                        group.provider
                      )}`,
                      (b) => `Notified ${b?.notified ?? 0}, failed ${b?.failed ?? 0}`
                    )
                  }
                >
                  Mark waitlist notified
                </Button>
              )}
            </div>
            <PlatformStepNote
              step={group.platformStep}
              autoApprove={group.autoApprove}
            />
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-start opacity-70">
                  <th className="text-start">Workspace</th>
                  <th className="text-start">User</th>
                  <th className="text-start">Kind</th>
                  <th className="text-start">Note</th>
                  <th className="text-start">Newsletter</th>
                  <th className="text-start">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {group.requests.map((row) => (
                  <tr key={row.id} className="border-t border-newTableBorder">
                    <td>{row.organization.name}</td>
                    <td className="break-all">{row.user.email}</td>
                    <td>{row.kind}</td>
                    <td className="break-all">{row.note || '—'}</td>
                    <td>{row.newsletter ? 'yes' : 'no'}</td>
                    <td>{row.status}</td>
                    <td className="text-end">
                      {row.kind === 'tester' && row.status === 'requested' && (
                        <Button
                          type="button"
                          loading={busy === row.id}
                          onClick={() =>
                            post(
                              row.id,
                              `/admin/early-access/${row.id}/approve`,
                              (b) =>
                                b?.platformStep?.kind === 'manual'
                                  ? 'Approved. Add them on the platform too (see the note above)'
                                  : 'Approved'
                            )
                          }
                        >
                          Approve
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};
