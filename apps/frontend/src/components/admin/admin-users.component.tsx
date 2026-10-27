'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import {
  platformAdminLabel,
  workspaceRoleLabel,
} from '@gitroom/helpers/utils/workspace.roles';
import { planDisplayName } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

// Shape of GET /admin/users (users.repository.ts listUsers): one row per
// user with the live workspaces they belong to.
interface UserWorkspace {
  id: string;
  name: string;
  role: string;
  memberDisabled: boolean;
  plan: string;
  period: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  lastName: string | null;
  providerName: string;
  activated: boolean;
  disabled: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  lastOnline: string | null;
  workspaces: UserWorkspace[];
}

interface UsersResponse {
  items: UserRow[];
  total: number;
  page: number;
  limit: number;
}

const useUsersList = (params: {
  page: number;
  limit: number;
  search: string;
}) => {
  const fetch = useFetch();
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    ...(params.search ? { search: params.search } : {}),
  });
  const key = `/admin/users?${query.toString()}`;
  return useSWR<UsersResponse>(key, async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Failed to load users');
    }
    return res.json();
  });
};

const fullName = (row: UserRow) =>
  [row.name, row.lastName].filter(Boolean).join(' ').trim();

export const AdminUsersComponent: FC = () => {
  const t = useT();
  const user = useUser();
  const fetch = useFetch();
  const toaster = useToaster();

  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, error, mutate } = useUsersList({
    page,
    limit,
    search,
  });

  const onApplySearch = useCallback(() => {
    setPage(0);
    setSearch(searchInput.trim());
  }, [searchInput]);

  const onClear = useCallback(() => {
    setPage(0);
    setSearch('');
    setSearchInput('');
  }, []);

  const toggleDisabled = useCallback(
    async (row: UserRow) => {
      const disabled = !row.disabled;
      if (
        disabled &&
        !window.confirm(
          t(
            'admin_users_disable_confirm',
            'Disable {{email}}? Their sessions stop working immediately.',
            { email: row.email }
          )
        )
      ) {
        return;
      }
      setBusyId(row.id);
      try {
        const res = await fetch(`/admin/users/${row.id}/disabled`, {
          method: 'POST',
          body: JSON.stringify({ disabled }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toaster.show(
            body?.message || t('admin_users_update_failed', 'Update failed'),
            'warning'
          );
          return;
        }
        toaster.show(
          disabled
            ? t('admin_users_disabled_ok', 'User disabled')
            : t('admin_users_enabled_ok', 'User enabled'),
          'success'
        );
        await mutate();
      } finally {
        setBusyId(null);
      }
    },
    [fetch, mutate, t, toaster]
  );

  if (!user?.isSuperAdmin) {
    return (
      <div className="text-textColor p-[20px]">
        {t('admin_no_access', 'You do not have access to this page.')}
      </div>
    );
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;
  const hasMore = data ? (page + 1) * limit < data.total : false;

  return (
    <div className="flex flex-col gap-[16px] text-textColor">
      <div className="flex items-center justify-between">
        <div className="text-[20px] font-[600]">
          {t('admin_users_title', 'Users')}
        </div>
        <div className="text-[13px] opacity-70">
          {data ? `${data.total} total` : ''}
        </div>
      </div>
      <div className="text-[13px] opacity-70" data-testid="roles-legend">
        {t(
          'vgh_admin_roles_legend',
          'Platform admin = ViralGenHub staff: the only accounts that can open this page, see other workspaces or impersonate. Owner, Admin and Member are roles inside one workspace; whoever creates a workspace is its Owner, and that gives no access outside it.'
        )}
      </div>

      <div className="flex flex-wrap gap-[12px] items-end bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[12px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[12px] opacity-70">
            {t('admin_users_search_label', 'Email or name contains')}
          </div>
          <div className="flex gap-[8px]">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onApplySearch();
              }}
              placeholder="user@example.com"
              className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor min-w-[240px]"
            />
            <Button onClick={onApplySearch}>{t('apply', 'Apply')}</Button>
          </div>
        </div>

        <div className="flex flex-col gap-[6px]">
          <div className="text-[12px] opacity-70">
            {t('admin_per_page', 'Per page')}
          </div>
          <select
            value={limit}
            onChange={(e) => {
              setPage(0);
              setLimit(parseInt(e.target.value, 10));
            }}
            className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <Button secondary onClick={onClear}>
          {t('admin_clear_filters', 'Clear filters')}
        </Button>
      </div>

      {isLoading ? (
        <LoadingComponent />
      ) : error ? (
        <div className="text-red-400">
          {t('admin_users_load_failed', 'Failed to load users.')}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="opacity-70">
          {t('admin_users_none', 'No users found.')}
        </div>
      ) : (
        <div className="border border-newTableBorder rounded-[8px] overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[1fr_180px_110px_170px_200px_110px_120px] gap-[12px] px-[12px] py-[10px] bg-newBgColorInner text-[12px] uppercase opacity-70 border-b border-newTableBorder">
              <div>{t('admin_users_col_email', 'Email')}</div>
              <div>{t('admin_users_col_name', 'Name')}</div>
              <div>{t('admin_users_col_provider', 'Provider')}</div>
              <div>{t('admin_users_col_created', 'Created')}</div>
              <div>{t('admin_users_col_workspaces', 'Workspaces')}</div>
              <div>{t('admin_users_col_status', 'Status')}</div>
              <div className="text-right">
                {t('admin_users_col_actions', 'Actions')}
              </div>
            </div>
            {data.items.map((row) => {
              const isSelf = row.id === user.id;
              // The API refuses these two; keep the button consistent with it.
              const canToggle = !isSelf && !(row.isSuperAdmin && !row.disabled);
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_180px_110px_170px_200px_110px_120px] gap-[12px] px-[12px] py-[10px] text-[13px] border-b border-newTableBorder last:border-b-0 items-start"
                >
                  <div className="break-all">
                    <div>{row.email}</div>
                    <div className="opacity-60 text-[12px] flex gap-[6px] flex-wrap">
                      {row.isSuperAdmin && (
                        <span
                          className="text-purple-400"
                          data-testid="platform-admin-badge"
                        >
                          {platformAdminLabel(t)}
                        </span>
                      )}
                      {!row.activated && (
                        <span>
                          {t('admin_users_not_activated', 'not activated')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="break-words opacity-90">
                    {fullName(row) || '—'}
                  </div>
                  <div className="opacity-90">{row.providerName}</div>
                  <div className="opacity-90">
                    <div>{new Date(row.createdAt).toLocaleString()}</div>
                    {row.lastOnline && (
                      <div className="opacity-60 text-[12px]">
                        {t('admin_users_last_online', 'Last online')}{' '}
                        {new Date(row.lastOnline).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="break-words">
                    <div>{row.workspaces.length}</div>
                    <div className="opacity-60 text-[12px]">
                      {row.workspaces
                        .slice(0, 3)
                        .map(
                          (w) =>
                            `${w.name} (${[
                              workspaceRoleLabel(w.role, t),
                              planDisplayName(w.plan),
                            ]
                              .filter(Boolean)
                              .join(' \u00b7 ')})`
                        )
                        .join(', ')}
                      {row.workspaces.length > 3 && ', …'}
                    </div>
                  </div>
                  <div>
                    <span
                      className={clsx(
                        'inline-block rounded-[4px] px-[8px] py-[2px] text-[12px] font-[600]',
                        row.disabled
                          ? 'bg-red-900/60 text-red-300'
                          : 'bg-green-900/60 text-green-300'
                      )}
                    >
                      {row.disabled
                        ? t('admin_users_status_disabled', 'Disabled')
                        : t('admin_users_status_active', 'Active')}
                    </span>
                  </div>
                  <div className="flex gap-[8px] justify-end">
                    <Button
                      secondary={!row.disabled}
                      disabled={!canToggle || busyId === row.id}
                      loading={busyId === row.id}
                      onClick={() => toggleDisabled(row)}
                      data-tooltip-id="tooltip"
                      data-tooltip-content={
                        isSelf
                          ? t(
                              'admin_users_cannot_self',
                              'You cannot disable your own account'
                            )
                          : row.isSuperAdmin && !row.disabled
                          ? t(
                              'vgh_admin_users_cannot_platform_admin',
                              'A platform admin cannot be disabled'
                            )
                          : undefined
                      }
                    >
                      {row.disabled
                        ? t('admin_users_enable', 'Enable')
                        : t('admin_users_disable', 'Disable')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-[13px] opacity-70">
          {t('admin_page_of', 'Page {{page}} of {{total}}', {
            page: page + 1,
            total: totalPages,
          })}
        </div>
        <div className="flex gap-[8px]">
          <Button
            secondary
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            {t('previous', 'Previous')}
          </Button>
          <Button disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
            {t('next', 'Next')}
          </Button>
        </div>
      </div>
    </div>
  );
};
