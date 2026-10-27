'use client';

// ViralGenHub (Joseph, 27 Oct 2026): paid features stay visible on lower plans,
// with a lock and one line naming the plan that includes them, so people can
// see what an upgrade adds. Never a dead click and never an error: a locked
// control opens this short note with a link to the billing page. The server
// still refuses the feature on plans that do not include it.

import React, { FC, useCallback } from 'react';
import clsx from 'clsx';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  LockableFeature,
  lockedPlansText,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/plan.locks';

export const LockIcon: FC<{ className?: string; size?: number }> = ({
  className,
  size = 12,
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// Small round lock pinned to the corner of a locked button.
export const LockBadge: FC<{ className?: string }> = ({ className }) => (
  <span
    className={clsx(
      'absolute -top-[5px] -end-[5px] w-[16px] h-[16px] rounded-full bg-newBgColorInner border border-newTableBorder text-newTextColor flex items-center justify-center pointer-events-none',
      className
    )}
    data-testid="plan-lock"
  >
    <LockIcon size={9} />
  </span>
);

// "Available on Business", translated.
export const useLockedLine = () => {
  const t = useT();
  return useCallback(
    (feature: LockableFeature) => {
      const plans = lockedPlansText(feature);
      return plans
        ? t('vgh_lock_available_on', 'Available on {{plans}}', { plans })
        : '';
    },
    [t]
  );
};

export const LockedFeatureNote: FC<{
  feature: LockableFeature;
  description: string;
  onNavigate?: () => void;
  className?: string;
}> = ({ feature, description, onNavigate, className }) => {
  const t = useT();
  const line = useLockedLine()(feature);
  return (
    <div
      className={clsx('flex flex-col gap-[12px]', className)}
      data-testid={`locked-${feature}`}
    >
      <div className="text-[14px] text-textItemBlur">{description}</div>
      <div className="flex items-center gap-[8px] text-[14px]">
        <LockIcon size={14} />
        <span>
          {line}
          {' · '}
          <a
            href="/billing"
            onClick={onNavigate}
            className="underline font-[600] text-newTextColor"
          >
            {t('vgh_lock_see_plans', 'See plans')}
          </a>
        </span>
      </div>
    </div>
  );
};

// Opens the short note for a locked control.
export const useOpenLockedFeature = () => {
  const modals = useModals();
  return useCallback(
    (feature: LockableFeature, title: string, description: string) => {
      modals.openModal({
        title,
        size: '440px',
        children: (close) => (
          <LockedFeatureNote
            feature={feature}
            description={description}
            onNavigate={close}
          />
        ),
      });
    },
    [modals]
  );
};

// Whole-page version (e.g. the Agent page on a plan without AI).
export const LockedFeaturePanel: FC<{
  feature: LockableFeature;
  title: string;
  description: string;
}> = ({ feature, title, description }) => (
  <div className="flex-1 flex items-center justify-center p-[24px]">
    <div className="flex flex-col gap-[12px] p-[24px] rounded-[12px] border border-newTableBorder bg-newBgColor max-w-[520px] w-full">
      <div className="text-[18px] font-[600] flex items-center gap-[8px]">
        <LockIcon size={16} />
        {title}
      </div>
      <LockedFeatureNote feature={feature} description={description} />
    </div>
  </div>
);
