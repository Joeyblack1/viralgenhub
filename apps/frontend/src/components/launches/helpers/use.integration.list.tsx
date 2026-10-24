'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';

export const useIntegrationList = () => {
  const fetch = useFetch();

  const load = useCallback(async (path: string) => {
    const response = await fetch(path);
    const { integrations } = await response.json();
    // A failed load must surface as `error`, not as the empty fallback list:
    // an empty list means "this workspace has no channels" to the onboarding.
    if (!response.ok || !Array.isArray(integrations)) {
      throw new Error('Could not load the channel list');
    }
    return integrations as any;
  }, []);

  return useSWR('/integrations/list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });
};
