'use client';

import { useState } from 'react';
import { useClickAway } from '@uidotdev/usehooks';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// ViralGenHub: the header's help menu. Where to get help, and where to
// follow ViralGenHub for news (the Telegram channel and every other channel
// listed on viralgenhub.com/follow).
export const HelpMenuComponent = () => {
  const t = useT();
  const [show, setShow] = useState(false);
  const ref = useClickAway<HTMLDivElement>(() => setShow(false));

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
        onClick={() => setShow(!show)}
        className="flex items-center hover:text-newTextColor"
        data-tooltip-id="tooltip"
        data-tooltip-content={t('vgh_help_tip', 'Help')}
        aria-label={t('vgh_help_tip', 'Help')}
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
      </button>
      {show && (
        <div className="opacity-0 animate-normalFadeDown mt-[10px] absolute w-[280px] max-w-[calc(100vw-24px)] top-[100%] end-0 bg-third text-textColor text-[14px] font-[400] rounded-[16px] flex flex-col border border-tableBorder z-[600] overflow-hidden">
          <div className="px-[16px] py-[12px] border-b border-tableBorder font-bold">
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
