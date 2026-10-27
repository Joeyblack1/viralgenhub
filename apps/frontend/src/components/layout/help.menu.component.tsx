'use client';

import { useCallback, useMemo, useState } from 'react';
import { useClickAway } from '@uidotdev/usehooks';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  CHANGELOG_URL,
  latestWhatsNewId,
  unseenWhatsNew,
  WHATS_NEW,
} from '@gitroom/helpers/utils/whats.new';

// "What's new" last-seen: stored on the account (POST /user/whats-new/seen) so
// it follows the person across devices; localStorage only covers the moment
// between opening the menu and the next /user/self load.
const seenKey = (userId?: string) => `vgh_whats_new_seen:${userId || ''}`;
const readLocalSeen = (userId?: string) => {
  try {
    return window.localStorage.getItem(seenKey(userId)) || '';
  } catch {
    return '';
  }
};
const writeLocalSeen = (userId: string | undefined, id: string) => {
  try {
    window.localStorage.setItem(seenKey(userId), id);
  } catch {
    // private mode or blocked storage: the server copy is enough
  }
};

// ViralGenHub: the header's help menu. What's new (a dot on the icon when
// there is something newer than the person last saw; no pop-up, no toast),
// where to get help, and where to follow ViralGenHub for news (the Telegram
// channel and every other channel listed on viralgenhub.com/follow).
export const HelpMenuComponent = () => {
  const t = useT();
  const user = useUser();
  const fetch = useFetch();
  const [show, setShow] = useState(false);
  const ref = useClickAway<HTMLDivElement>(() => setShow(false));

  const [localSeen, setLocalSeen] = useState<string>(() =>
    typeof window === 'undefined' ? '' : readLocalSeen(user?.id)
  );
  const serverSeen = (user as { whatsNewSeen?: string | null } | undefined)
    ?.whatsNewSeen;
  const seen = [serverSeen || '', localSeen].sort().pop() || null;
  const unseen = useMemo(() => unseenWhatsNew(seen), [seen]);
  const hasNew = !!user?.id && unseen.length > 0;
  // what the open menu lists: the new entries, or the latest one; at most two
  const [listed, setListed] = useState(WHATS_NEW.slice(0, 1));
  const [newIds, setNewIds] = useState<string[]>([]);

  const toggle = useCallback(() => {
    const opening = !show;
    setShow(opening);
    if (!opening) {
      return;
    }
    setListed((unseen.length ? unseen : WHATS_NEW).slice(0, 2));
    setNewIds(hasNew ? unseen.map((e) => e.id) : []);
    if (hasNew) {
      const latest = latestWhatsNewId();
      setLocalSeen(latest);
      writeLocalSeen(user?.id, latest);
      fetch('/user/whats-new/seen', {
        method: 'POST',
        body: JSON.stringify({ id: latest }),
      }).catch(() => undefined);
    }
  }, [show, unseen, hasNew, fetch, user?.id]);

  const links = [
    {
      href: 'https://viralgenhub.com/faq',
      label: t('vgh_help_faq', 'Help and FAQ'),
    },
    {
      href: 'https://viralgenhub.com/help/connect',
      label: t('vgh_help_connect', 'Connecting your accounts'),
    },
    {
      href: 'mailto:support@viralgenhub.com',
      label: t('vgh_help_email', 'Email support@viralgenhub.com'),
    },
  ];
  const community = [
    {
      href: 'https://t.me/viralgenhub',
      label: t('vgh_help_telegram', 'Telegram channel: news and tips'),
    },
    {
      href: 'https://viralgenhub.com/follow',
      label: t('vgh_help_follow', 'All our channels'),
    },
  ];

  const item = (l: { href: string; label: string }) => (
    <a
      key={l.href}
      href={l.href}
      target={l.href.startsWith('http') ? '_blank' : undefined}
      rel="noreferrer"
      onClick={() => setShow(false)}
      className="block px-[16px] py-[10px] hover:bg-boxFocused transition-colors"
    >
      {l.label}
    </a>
  );

  return (
    <div className="relative cursor-pointer select-none" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="relative flex items-center hover:text-newTextColor"
        data-tooltip-id="tooltip"
        data-tooltip-content={
          hasNew
            ? t('vgh_help_tip_new', "Help and what's new")
            : t('vgh_help_tip', 'Help')
        }
        aria-label={
          hasNew
            ? t('vgh_help_tip_new', "Help and what's new")
            : t('vgh_help_tip', 'Help')
        }
        aria-expanded={show}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="9.25"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M9.5 9.5C9.5 8.12 10.62 7 12 7C13.38 7 14.5 8.12 14.5 9.5C14.5 10.88 13.38 11.5 12 12V13.25"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" />
        </svg>
        {hasNew && (
          <span
            className="absolute -top-[1px] -end-[1px] w-[9px] h-[9px] rounded-full bg-red-500 border-[1.5px] border-newBgColorInner"
            data-testid="whats-new-dot"
            aria-hidden="true"
          />
        )}
      </button>
      {show && (
        <div className="opacity-0 animate-normalFadeDown mt-[10px] absolute w-[320px] max-w-[calc(100vw-24px)] top-[100%] end-0 bg-third text-textColor text-[14px] font-[400] rounded-[16px] flex flex-col border border-tableBorder z-[600] overflow-hidden">
          <div
            className="px-[16px] pt-[12px] pb-[8px] border-b border-tableBorder"
            data-testid="whats-new"
          >
            <div className="font-bold mb-[6px]">
              {t('vgh_whats_new', "What's new")}
            </div>
            <div className="flex flex-col gap-[10px] max-h-[260px] overflow-y-auto">
              {listed.map((entry) => (
                <div key={entry.id} className="text-[13px]">
                  <div className="text-[12px] opacity-70 flex items-center gap-[6px]">
                    {entry.date}
                    {newIds.includes(entry.id) && (
                      <span className="rounded-[4px] px-[5px] py-[1px] bg-red-500 text-white text-[10px] font-[600] opacity-100">
                        {t('vgh_whats_new_badge', 'New')}
                      </span>
                    )}
                  </div>
                  <ul className="list-disc ps-[16px] mt-[2px] flex flex-col gap-[2px]">
                    {entry.items.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <a
              href={CHANGELOG_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setShow(false)}
              className="block mt-[8px] text-[13px] underline hover:text-newTextColor"
            >
              {t('vgh_whats_new_all', 'All changes on viralgenhub.com/changelog')}
            </a>
          </div>
          <div className="px-[16px] pt-[12px] pb-[4px] text-[12px] opacity-70">
            {t('vgh_help_title', 'Help')}
          </div>
          {links.map(item)}
          <div className="px-[16px] pt-[12px] pb-[4px] border-t border-tableBorder text-[12px] opacity-70">
            {t('vgh_help_community', 'Follow ViralGenHub')}
          </div>
          {community.map(item)}
        </div>
      )}
    </div>
  );
};
