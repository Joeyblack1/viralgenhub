'use client';

import React, { FC, ReactNode, useCallback, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { AiImageModal } from '@gitroom/frontend/components/launches/ai.image';

type Tab = 'posts' | 'image' | 'agent';

const useImageCredits = (enabled: boolean) => {
  const fetch = useFetch();
  return useSWR<{ credits: number }>(
    enabled ? 'ai-studio-image-credits' : null,
    async () => {
      const res = await fetch('/copilot/credits?type=ai_images');
      if (!res.ok) {
        throw new Error('Failed to load credits');
      }
      return res.json();
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );
};

const CreateImage: FC = () => {
  const t = useT();
  const toaster = useToaster();
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [preview, setPreview] = useState('');
  const { data, mutate } = useImageCredits(true);

  const onChange = useCallback(
    (image: { id: string; path: string }) => {
      setPreview(image.path);
      setVersion((v) => v + 1);
      mutate();
      toaster.show(
        t('vgh_ai_studio_image_saved', 'Image saved to your media library'),
        'success'
      );
    },
    [mutate, toaster, t]
  );

  return (
    <div className="flex flex-col gap-[12px]">
      {data && (
        <div className="text-[13px] opacity-70">
          {t('vgh_ai_studio_credits_left', 'AI image credits left this month')}
          : {data.credits}
        </div>
      )}
      <div className={clsx(loading && 'pointer-events-none opacity-60')}>
        {/* remounted after each image so the prompt is ready for the next one */}
        <AiImageModal
          key={version}
          close={() => undefined}
          setLoading={setLoading}
          onChange={onChange}
        />
      </div>
      {loading && (
        <div className="loading-shimmer text-[13px]">
          {t('vgh_ai_studio_creating_image', 'Creating your image...')}
        </div>
      )}
      {preview && (
        <img
          src={preview}
          alt=""
          className="max-h-[260px] rounded-[8px] object-contain"
        />
      )}
    </div>
  );
};

const AskAgent: FC = () => {
  const t = useT();
  const router = useRouter();
  const modals = useModals();
  const open = useCallback(() => {
    modals.closeAll();
    router.push('/agents');
  }, [modals, router]);
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="text-[14px] opacity-80">
        {t(
          'vgh_ai_studio_agent_text',
          'The agent is a chat assistant that knows your channels. Ask it to plan a week of posts, rewrite a draft, or schedule content for you.'
        )}
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={open}>
          {t('vgh_ai_studio_open_agent', 'Open the agent')}
        </Button>
      </div>
    </div>
  );
};

export const AiStudio: FC<{ writePosts: ReactNode }> = ({ writePosts }) => {
  const t = useT();
  const [tab, setTab] = useState<Tab>('posts');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'posts', label: t('vgh_ai_studio_write', 'Write posts') },
    { id: 'image', label: t('vgh_ai_studio_image', 'Create image') },
    { id: 'agent', label: t('vgh_ai_studio_agent', 'Ask the agent') },
  ];
  return (
    <div className="flex flex-col gap-[16px] bg-newBgColorInner rounded-[8px] p-[16px]">
      <div className="flex gap-[8px] flex-wrap" role="tablist">
        {tabs.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={tab === p.id}
            onClick={() => setTab(p.id)}
            className={clsx(
              'cursor-pointer rounded-[4px] px-[12px] h-[34px] text-[13px] border',
              tab === p.id
                ? 'bg-[#612BD3] border-[#612BD3] text-white'
                : 'bg-newColColor border-newBgLineColor'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {tab === 'posts' && writePosts}
      {tab === 'image' && <CreateImage />}
      {tab === 'agent' && <AskAgent />}
    </div>
  );
};
