'use client';

import { FC, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { OnboardingModal } from '@gitroom/frontend/components/onboarding/onboarding.modal';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';

// Set (per workspace, in this browser) once the user has closed or skipped the
// first-run onboarding, so a workspace with no channels is only greeted once.
const onboardingDismissedKey = (orgId: string) =>
  `onboarding_dismissed_${orgId}`;

export const Onboarding: FC = () => {
  const query = useSearchParams();
  const modal = useModals();
  const router = useRouter();
  const user = useUser();
  const { data: integrations, isLoading, error } = useIntegrationList();
  const modalOpen = useRef(false);
  const t = useT();

  const handleClose = useCallback(() => {
    if (user?.orgId) {
      localStorage.setItem(onboardingDismissedKey(user.orgId), '1');
    }
    modalOpen.current = false;
    modal.closeAll();
    router.push('/launches');
  }, [modal, router, user?.orgId]);

  useEffect(() => {
    // Opened right after sign-up (?onboarding=true, set by the backend), or on
    // the first visit to a workspace that has no channels yet and has not
    // skipped the onboarding before. The second case waits for the channel
    // list to really come back (not the empty fallback, not a failed load).
    const onboarding = query.get('onboarding');
    const firstRun =
      !!user?.orgId &&
      !isLoading &&
      !error &&
      integrations?.length === 0 &&
      !localStorage.getItem(onboardingDismissedKey(user.orgId));
    if (!onboarding && !firstRun) {
      if (modalOpen.current) {
        modalOpen.current = false;
        modal.closeAll();
      }
      return;
    }
    if (modalOpen.current) {
      return;
    }
    modalOpen.current = true;
    modal.openModal({
      // title: t('onboarding', 'Welcome to Postiz'),
      withCloseButton: true,
      closeOnEscape: false,
      removeLayout: true,
      askClose: true,
      fullScreen: true,
      onClose: handleClose,
      children: <OnboardingModal onClose={handleClose} />,
    });
  }, [
    query,
    handleClose,
    t,
    user?.orgId,
    isLoading,
    error,
    integrations?.length,
  ]);

  return null;
};
