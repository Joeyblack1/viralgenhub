'use client';

import { useSearchParams } from 'next/navigation';
import { FC, useCallback, useEffect } from 'react';
import {
  EARLY_PARAM,
  browserStore,
  stashEarlyIntent,
} from '@gitroom/helpers/utils/early.access.intent';
const ReturnUrlComponent: FC = () => {
  const params = useSearchParams();
  const url = params.get('returnUrl');
  const early = params.get(EARLY_PARAM);
  useEffect(() => {
    // Only same-site URLs, so a crafted login link can't send people elsewhere after sign-in
    if (!url) return;
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.origin === window.location.origin) {
        localStorage.setItem('returnUrl', parsed.href);
      }
    } catch {}
  }, [url]);
  // A signed-out visitor from a website "Join the waitlist" link arrives here
  // as /auth?early=<platform>; keep it until they reach the calendar.
  useEffect(() => {
    if (early !== null) {
      stashEarlyIntent(browserStore(), early);
    }
  }, [early]);
  return null;
};
export const useReturnUrl = () => {
  return {
    getAndClear: useCallback(() => {
      const data = localStorage.getItem('returnUrl');
      localStorage.removeItem('returnUrl');
      // A value saved by an older build may point off-site; drop it
      try {
        return data && new URL(data).origin === window.location.origin
          ? data
          : null;
      } catch {
        return null;
      }
    }, []),
  };
};
export default ReturnUrlComponent;
