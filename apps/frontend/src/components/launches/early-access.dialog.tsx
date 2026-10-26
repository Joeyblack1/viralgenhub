'use client';

import React, { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';

// A platform tile from /integrations/preview. Preview platforms are open to
// testers (testerAccess), coming-soon platforms are open to nobody yet.
export interface EarlyAccessTile {
  identifier: string;
  name: string;
  preview?: boolean;
  testerAccess?: boolean;
  comingSoon?: boolean;
  waiting?: number;
  myRequest?: string;
}

export const isLockedTile = (item: EarlyAccessTile) =>
  !!item.comingSoon || (!!item.preview && item.testerAccess === false);

export const EarlyAccessBadges: FC<{
  item: EarlyAccessTile;
  requested?: boolean;
  isMobile?: boolean;
}> = ({ item, requested, isMobile }) => {
  const t = useT();
  const waiting = item.waiting || 0;
  return (
    <>
      <div
        className={clsx(
          isMobile ? 'ms-[8px] inline-block' : 'absolute top-[8px] start-[8px]',
          'text-[10px] rounded-[4px] px-[6px] py-[1px] bg-btnSimple'
        )}
        data-tooltip-id="tooltip"
        data-tooltip-content={
          item.comingSoon
            ? t(
                'vgh_coming_soon_tooltip',
                'Not available yet. Join the waitlist and we will email you when it goes live'
              )
            : t(
                'vgh_preview_testers_tooltip',
                'In testing with a small group. Request early access to become a tester'
              )
        }
      >
        {item.comingSoon
          ? t('vgh_coming_soon', 'Coming soon')
          : t('vgh_preview_testers', 'Preview · testers')}
      </div>
      {(waiting > 0 || requested) && (
        <div
          className={clsx(
            isMobile ? 'ms-[8px] inline-block' : 'block',
            'text-[11px] opacity-70'
          )}
        >
          {requested
            ? t('vgh_requested', 'Requested')
            : t('vgh_waiting', '{{n}} waiting', { n: waiting })}
        </div>
      )}
    </>
  );
};

// This workspace's own requests (GET /integrations/early-access), for the
// newsletter choice on the status view.
const useMyEarlyAccess = () => {
  const fetch = useFetch();
  return useSWR<Array<{ provider: string; newsletter: boolean }>>(
    '/integrations/early-access',
    async (url: string) => (await fetch(url)).json()
  );
};

// The newsletter opt-in for a workspace that has already asked. It can only
// turn the newsletter on, through the same request endpoint (which keeps the
// existing request and only lets a later "yes" stick).
const EarlyAccessNewsletter: FC<{ provider: string }> = ({ provider }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = useMyEarlyAccess();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const subscribed =
    saved ||
    !!(Array.isArray(data) &&
      data.find((r) => r.provider === provider)?.newsletter);

  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/integrations/early-access', {
        method: 'POST',
        body: JSON.stringify({ provider, newsletter: true }),
      });
      if (!res.ok) {
        toaster.show(
          t('vgh_early_access_failed', 'Could not save your request'),
          'warning'
        );
        return;
      }
      setSaved(true);
      mutate();
    } finally {
      setBusy(false);
    }
  }, [provider]);

  return (
    <label className="flex items-center gap-[8px] text-[14px] cursor-pointer">
      <input
        type="checkbox"
        checked={subscribed}
        disabled={subscribed || busy}
        onChange={(e) => {
          if (e.target.checked) {
            subscribe();
          }
        }}
      />
      <span>
        {t('vgh_newsletter_optin', 'Also send me the ViralGenHub newsletter')}
      </span>
    </label>
  );
};

// Live platforms offered after a request, and how to start connecting one
// (the Add Channel dialog's own connect flow).
export interface EarlyAccessSuggest {
  suggest?: Array<{ identifier: string; name: string }>;
  onConnect?: (identifier: string) => void;
}

export const EarlyAccessDialog: FC<
  {
    item: EarlyAccessTile;
    onRequested: (provider: string) => void;
  } & EarlyAccessSuggest
> = ({ item, onRequested, suggest, onConnect }) => {
  const t = useT();
  const fetch = useFetch();
  const modals = useModals();
  const toaster = useToaster();
  const [note, setNote] = useState('');
  const [newsletter, setNewsletter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Already asked (e.g. arriving again from a "Join the waitlist" link): say
  // where the request stands instead of showing the form again.
  const alreadyAsked = !!item.myRequest;

  const submit = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/integrations/early-access', {
        method: 'POST',
        body: JSON.stringify({
          provider: item.identifier,
          newsletter,
          ...(!item.comingSoon && note.trim() ? { note: note.trim() } : {}),
        }),
      });
      if (!res.ok) {
        toaster.show(
          t('vgh_early_access_failed', 'Could not save your request'),
          'warning'
        );
        return;
      }
      setDone(true);
      onRequested(item.identifier);
    } finally {
      setBusy(false);
    }
  }, [item, note, newsletter]);

  if (done) {
    return (
      <div className="flex flex-col gap-[16px] pt-[8px]">
        <p className="text-[14px] text-textColor/80">
          {item.comingSoon
            ? t(
                'vgh_waitlist_done',
                "You're on the waitlist. We'll email you the day {{name}} goes live.",
                { name: item.name }
              )
            : t(
                'vgh_early_access_done',
                "You're on the list. We add testers every week."
              )}
        </p>
        {!!suggest?.length && !!onConnect && (
          <div className="flex flex-col gap-[8px]">
            <p className="text-[14px]">
              {t('vgh_connect_today', 'Connect one of these today:')}
            </p>
            <div className="flex flex-wrap gap-[8px]">
              {suggest.map((p) => (
                <button
                  key={p.identifier}
                  type="button"
                  className="flex items-center gap-[8px] h-[36px] px-[12px] rounded-[8px] bg-newTableHeader text-[14px] hover:bg-btnSimple focus-visible:ring-2 focus-visible:ring-btnPrimary"
                  onClick={() => {
                    modals.closeCurrent();
                    onConnect(p.identifier);
                  }}
                >
                  <img
                    src={
                      p.identifier === 'youtube'
                        ? '/icons/platforms/youtube.svg'
                        : `/icons/platforms/${p.identifier}.png`
                    }
                    alt=""
                    className="w-[20px] h-[20px] rounded-full"
                  />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <Button type="button" onClick={() => modals.closeCurrent()}>
          {t('vgh_close', 'Close')}
        </Button>
      </div>
    );
  }

  if (alreadyAsked) {
    return (
      <div className="flex flex-col gap-[16px] pt-[8px]">
        <p className="text-[14px] text-textColor/80">
          {item.comingSoon
            ? t(
                'vgh_waitlist_already',
                "You're already on the {{name}} waitlist. We'll email you the day it goes live.",
                { name: item.name }
              )
            : t(
                'vgh_tester_already',
                'Your request to test {{name}} is in. We approve new testers every week.',
                { name: item.name }
              )}
        </p>
        <EarlyAccessNewsletter provider={item.identifier} />
        <Button type="button" onClick={() => modals.closeCurrent()}>
          {t('vgh_close', 'Close')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[16px] pt-[8px]">
      <p className="text-[14px] text-textColor/80">
        {item.comingSoon
          ? t(
              'vgh_waitlist_body',
              "We'll email you the day {{name}} goes live.",
              { name: item.name }
            )
          : t(
              'vgh_tester_body',
              'Testers connect {{name}} before everyone else and tell us what to fix. We approve new testers every week.',
              { name: item.name }
            )}
      </p>
      {!item.comingSoon && (
        <label className="flex flex-col gap-[6px] text-[14px]">
          <span>
            {t(
              'vgh_tester_account',
              'Your {{name}} account or page (optional)',
              { name: item.name }
            )}
          </span>
          <input
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            className="h-[42px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] outline-none"
          />
        </label>
      )}
      <label className="flex items-center gap-[8px] text-[14px] cursor-pointer">
        <input
          type="checkbox"
          checked={newsletter}
          onChange={(e) => setNewsletter(e.target.checked)}
        />
        <span>
          {t('vgh_newsletter_optin', 'Also send me the ViralGenHub newsletter')}
        </span>
      </label>
      <Button type="button" loading={busy} onClick={submit}>
        {item.comingSoon
          ? t('vgh_join_waitlist', 'Join the waitlist')
          : t('vgh_request_early_access', 'Request early access')}
      </Button>
      <p className="text-[12px] text-textColor/60 -mt-[8px]">
        {item.comingSoon
          ? t('vgh_waitlist_email_once', "We'll email you once when it's live.")
          : t(
              'vgh_tester_email_once',
              "We'll email you once when you're approved."
            )}
      </p>
    </div>
  );
};

export const useOpenEarlyAccess = (onRequested: (provider: string) => void) => {
  const modals = useModals();
  const t = useT();
  return useCallback(
    (item: EarlyAccessTile, extra: EarlyAccessSuggest = {}) => {
      modals.openModal({
        title: item.comingSoon
          ? t('vgh_waitlist_title', 'Join the {{name}} waitlist', {
              name: item.name,
            })
          : t('vgh_tester_title', 'Become a {{name}} tester', {
              name: item.name,
            }),
        withCloseButton: true,
        children: (
          <EarlyAccessDialog item={item} onRequested={onRequested} {...extra} />
        ),
      });
    },
    [modals, onRequested]
  );
};
