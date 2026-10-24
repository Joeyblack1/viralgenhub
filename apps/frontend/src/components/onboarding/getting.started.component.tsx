'use client';

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { expandPostsList } from '@gitroom/helpers/utils/posts.list.minify';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useAddProvider } from '@gitroom/frontend/components/launches/add.provider.component';
import { useCreatePost } from '@gitroom/frontend/components/launches/new.post';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';

// Per workspace, in this browser: the checklist was closed / the team step was
// visited. The other two steps are read from the workspace itself.
const checklistDismissedKey = (orgId: string) =>
  `getting_started_dismissed_${orgId}`;
const teamStepKey = (orgId: string) => `getting_started_team_${orgId}`;

const readFlag = (key: string) =>
  typeof window !== 'undefined' && !!localStorage.getItem(key);

// Whether this workspace has any post at all (one row is enough to know).
// /posts/list only counts upcoming posts unless state=published, so both are
// asked: anything scheduled or drafted ahead, or anything already published.
const usePostsTotal = (enabled: boolean) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const totals = await Promise.all(
      ['all', 'published'].map(async (state) => {
        const response = await fetch(`/posts/list?limit=1&state=${state}`);
        return expandPostsList(await response.json()).total as number;
      })
    );
    return totals.reduce((sum, total) => sum + (total || 0), 0);
  }, []);
  return useSWR(enabled ? '/posts/list-total' : null, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

const Tick: FC<{ done: boolean; index: number }> = ({ done, index }) => (
  <div
    className={clsx(
      'w-[22px] h-[22px] min-w-[22px] rounded-full flex items-center justify-center text-[11px] font-[600] transition-colors',
      done
        ? 'bg-btnPrimary text-white'
        : 'border border-newSep text-newTextColor/70'
    )}
  >
    {done ? (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ) : (
      index + 1
    )}
  </div>
);

export const GettingStarted: FC<{
  update: () => void;
}> = ({ update }) => {
  const t = useT();
  const user = useUser();
  const router = useRouter();
  const addProvider = useAddProvider(update);
  const createPost = useCreatePost();
  const {
    data: integrations,
    isLoading: integrationsLoading,
    error: integrationsError,
  } = useIntegrationList();
  const { posts: calendarPosts } = useCalendar();
  const orgId = user?.orgId || '';
  // Flags come from localStorage, so they are read after mount and nothing is
  // rendered before that (keeps the server and first client render identical).
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [teamVisited, setTeamVisited] = useState(false);
  useEffect(() => {
    if (!orgId) {
      return;
    }
    setDismissed(readFlag(checklistDismissedKey(orgId)));
    setTeamVisited(readFlag(teamStepKey(orgId)));
    setLoaded(true);
  }, [orgId]);

  const hasChannels = (integrations?.length || 0) > 0;
  const { data: postsTotal, mutate: refreshPostsTotal } = usePostsTotal(
    !dismissed && hasChannels
  );
  // The calendar reloads its posts after the composer saves; follow it so the
  // step ticks (and the checklist goes) without a page reload.
  useEffect(() => {
    if (calendarPosts.length > 0) {
      refreshPostsTotal();
    }
  }, [calendarPosts.length]);
  const hasPosts = (postsTotal || 0) > 0 || calendarPosts.length > 0;

  const dismiss = useCallback(() => {
    if (orgId) {
      localStorage.setItem(checklistDismissedKey(orgId), '1');
    }
    setDismissed(true);
  }, [orgId]);

  const openTeam = useCallback(() => {
    if (orgId) {
      localStorage.setItem(teamStepKey(orgId), '1');
    }
    setTeamVisited(true);
    // Teams is a paid feature: without it the plan page is where it unlocks.
    router.push(user?.tier?.team_members ? '/settings?tab=teams' : '/billing');
  }, [orgId, user?.tier?.team_members, router]);

  const steps = useMemo(
    () => [
      {
        id: 'channel',
        label: t('checklist_connect_channel', 'Connect a channel'),
        done: hasChannels,
        onClick: addProvider,
      },
      {
        id: 'post',
        label: t('checklist_first_post', 'Schedule your first post'),
        done: hasPosts,
        // The composer needs a channel to post to.
        disabled: !hasChannels,
        onClick: createPost,
      },
      {
        id: 'team',
        label: t(
          'checklist_invite_team',
          'Invite your team or install the app'
        ),
        done: teamVisited,
        onClick: openTeam,
      },
    ],
    [t, hasChannels, hasPosts, teamVisited, addProvider, createPost, openTeam]
  );

  // Shown only while the workspace is still empty; gone once it has a channel
  // and a post, or when closed. Waits for the post count before deciding so it
  // does not flash for an established workspace.
  if (!loaded || dismissed || integrationsLoading || integrationsError) {
    return null;
  }
  if (hasChannels && (postsTotal === undefined || hasPosts)) {
    return null;
  }

  const doneCount = steps.filter((p) => p.done).length;

  return (
    <div className="bg-newTableHeader border border-newBorder rounded-[8px] px-[16px] py-[12px] flex flex-col gap-[10px]">
      <div className="flex items-center gap-[8px]">
        <div className="flex-1 text-[14px] font-[600]">
          {t('getting_started', 'Getting started')}
          <span className="ms-[8px] text-[12px] font-[500] text-newTextColor/60">
            {doneCount}/{steps.length}
          </span>
        </div>
        <button
          type="button"
          onClick={dismiss}
          data-tooltip-id="tooltip"
          data-tooltip-content={t('dismiss', 'Dismiss')}
          className="text-btnText bg-btnSimple hover:bg-boxHover rounded-[6px] w-[24px] h-[24px] flex items-center justify-center cursor-pointer select-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M1 1L11 11M11 1L1 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="flex gap-[8px] mobile:flex-col">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            disabled={step.disabled}
            onClick={step.onClick}
            className={clsx(
              'flex-1 flex items-center gap-[10px] text-start rounded-[8px] px-[12px] py-[10px] bg-newBgColorInner border border-newBorder transition-colors',
              step.disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-boxHover cursor-pointer'
            )}
          >
            <Tick done={step.done} index={index} />
            <span
              className={clsx(
                'text-[14px] leading-[1.3]',
                step.done && 'text-newTextColor/60 line-through'
              )}
            >
              {step.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
