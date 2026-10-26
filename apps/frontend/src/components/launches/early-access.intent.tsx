'use client';

import { FC, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useAddProvider } from '@gitroom/frontend/components/launches/add.provider.component';
import { shouldShowOnboarding } from '@gitroom/frontend/components/onboarding/onboarding';
import {
  EARLY_PARAM,
  browserStore,
  peekEarlyIntent,
  searchWithoutEarly,
  stashEarlyIntent,
} from '@gitroom/helpers/utils/early.access.intent';

// The website's "Join the waitlist" / "Request tester access" links land on
// /launches?early=<platform>. Signed-out visitors keep the intent through
// sign-up (the auth layout stashes it too). Here the parameter is stashed and
// removed from the address bar, then the Add Channel dialog opens once and
// acts on it (AddProviderComponent autoOpenEarly). When the first-run
// onboarding is about to show, its own channel list acts on it instead.
export const EarlyAccessIntent: FC<{ update: () => void }> = ({ update }) => {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const user = useUser();
  const { isLoading, error, data: integrations } = useIntegrationList();
  const openAddChannel = useAddProvider(update, false, true);
  const handled = useRef(false);

  const param = search.get(EARLY_PARAM);
  useEffect(() => {
    if (param === null) {
      return;
    }
    stashEarlyIntent(browserStore(), param);
    router.replace(`${pathname}${searchWithoutEarly(window.location.search)}`);
  }, [param]);

  useEffect(() => {
    if (handled.current || !user?.orgId || isLoading || error) {
      return;
    }
    if (!peekEarlyIntent(browserStore())) {
      return;
    }
    handled.current = true;
    if (
      shouldShowOnboarding({
        onboardingParam: search.get('onboarding'),
        orgId: user.orgId,
        isLoading,
        error,
        channels: integrations?.length,
      })
    ) {
      return;
    }
    openAddChannel();
  }, [user?.orgId, isLoading, error, integrations?.length, param]);

  return null;
};
