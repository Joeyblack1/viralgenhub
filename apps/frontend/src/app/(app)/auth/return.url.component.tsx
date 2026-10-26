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
    if (url?.indexOf?.('http')! > -1) {
      localStorage.setItem('returnUrl', url!);
    }
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
      return data;
    }, []),
  };
};
export default ReturnUrlComponent;
