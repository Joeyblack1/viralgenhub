'use client';

// ViralGenHub: help block under bring-your-own-key forms. A button to the
// official key page (when it has a fixed URL), the "Where do I get this?"
// guide, and a reminder to be signed in to the right account first.
import React, { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  connectHelpUrl,
  connectKeyPageUrl,
} from '@gitroom/frontend/components/launches/custom-field-placeholders';

export const ConnectHelpLink: FC<{ identifier: string }> = ({ identifier }) => {
  const t = useT();
  const url = connectHelpUrl(identifier);
  const keyPage = connectKeyPageUrl(identifier);
  if (!url) return null;
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex flex-wrap items-center gap-[12px]">
        {!!keyPage && (
          <a
            href={keyPage}
            target="_blank"
            rel="noopener noreferrer"
            className="h-[32px] px-[12px] rounded-[8px] bg-btnPrimary text-white text-[13px] font-[600] flex items-center hover:opacity-90"
          >
            {t('vgh_open_key_page', 'Open the key page')}
          </a>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] underline hover:font-bold"
        >
          {t('vgh_connect_help', 'Where do I get this?')}
        </a>
      </div>
      <div className="text-[12px] leading-[16px] text-textItemBlur">
        {t(
          'vgh_connect_signed_in_warning',
          'Make sure this browser is signed in to the right account (your brand account, not a personal one) before you copy the key.'
        )}
      </div>
    </div>
  );
};
