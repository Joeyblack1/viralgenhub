'use client';

import { FC, useCallback, useEffect, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';

// While TikTok has not audited ViralGenHub (TIKTOK_AUDITED is not "true"),
// Direct Post can only publish privately from a private account, so the
// calendar tells workspaces with a TikTok channel to use the inbox draft.
// Closed per person, in this browser (same pattern as Getting started).
const dismissedKey = (userId: string) => `tiktok_unaudited_banner_${userId}`;

export const TikTokUnauditedBanner: FC = () => {
  const t = useT();
  const { tiktokAudited } = useVariables();
  const user = useUser();
  const { data: integrations } = useIntegrationList();
  const [dismissed, setDismissed] = useState(true);

  // localStorage is read after mount (and may be unavailable)
  useEffect(() => {
    if (!user?.id) return;
    try {
      setDismissed(!!localStorage.getItem(dismissedKey(user.id)));
    } catch {
      setDismissed(false);
    }
  }, [user?.id]);

  const dismiss = useCallback(() => {
    try {
      if (user?.id) localStorage.setItem(dismissedKey(user.id), '1');
    } catch {
      // still hidden for this visit
    }
    setDismissed(true);
  }, [user?.id]);

  const hasTikTok = (integrations || []).some(
    (p: any) => p.identifier === 'tiktok' && !p.disabled
  );

  if (tiktokAudited !== false || !hasTikTok || dismissed) {
    return null;
  }

  return (
    <div className="bg-newTableHeader border border-newBorder rounded-[8px] px-[16px] py-[10px] flex items-center gap-[8px] text-[14px]">
      <div className="flex-1 text-balance">
        {t(
          'tiktok_unaudited_banner',
          "TikTok: until TikTok finishes reviewing ViralGenHub, choose 'Send to my TikTok inbox as a draft' and publish from the TikTok app. Direct posts can only be private for now."
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        data-tooltip-id="tooltip"
        data-tooltip-content={t('dismiss', 'Dismiss')}
        aria-label={t('dismiss', 'Dismiss')}
        className="text-btnText bg-btnSimple hover:bg-boxHover rounded-[6px] w-[24px] h-[24px] flex items-center justify-center cursor-pointer select-none shrink-0"
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
  );
};
