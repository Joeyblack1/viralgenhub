'use client';

import React, { FC, ReactNode, useCallback } from 'react';
import Link from 'next/link';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  AddAnnouncementModal,
  ImpersonatePicker,
} from '@gitroom/frontend/components/layout/impersonate';
import { ImportDebugPostModal } from '@gitroom/frontend/components/launches/import-debug-post.modal';
import { XSpendCard } from '@gitroom/frontend/components/admin/x-spend.card';
import { SettingsCheckCard } from '@gitroom/frontend/components/admin/settings-check.card';
import { useEarlyAccessList } from '@gitroom/frontend/components/admin/admin-early-access.component';

const cardClass =
  'border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[4px] text-start';

const LinkCard: FC<{ href: string; title: string; text: string }> = ({
  href,
  title,
  text,
}) => (
  <Link
    href={href}
    className={`${cardClass} hover:bg-tableBorder transition-colors`}
  >
    <div className="text-[16px] font-[600]">{title}</div>
    <div className="text-[13px] opacity-70">{text}</div>
  </Link>
);

const ActionCard: FC<{
  title: string;
  text: string;
  onClick: () => void;
}> = ({ title, text, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`${cardClass} hover:bg-tableBorder transition-colors cursor-pointer`}
  >
    <div className="text-[16px] font-[600]">{title}</div>
    <div className="text-[13px] opacity-70">{text}</div>
  </button>
);

// Says how many tester requests wait for Approve, so a new one is visible
// from /admin without opening the page.
const EarlyAccessLinkCard: FC = () => {
  const { data } = useEarlyAccessList();
  const testers =
    data?.providers.reduce(
      (n, group) =>
        n +
        group.requests.filter(
          (r) => r.kind === 'tester' && r.status === 'requested'
        ).length,
      0
    ) || 0;
  return (
    <LinkCard
      href="/admin/early-access"
      title={testers ? `Early access (${testers} to approve)` : 'Early access'}
      text={
        testers
          ? `${testers} tester ${
              testers === 1 ? 'request is' : 'requests are'
            } waiting for Approve.`
          : 'Early-access requests waiting for a decision.'
      }
    />
  );
};

const Section: FC<{ title: string; children: ReactNode }> = ({
  title,
  children,
}) => (
  <div className="flex flex-col gap-[8px]">
    <div className="text-[12px] uppercase opacity-70">{title}</div>
    {children}
  </div>
);

export const AdminIndexComponent: FC = () => {
  const user = useUser();
  const { openModal } = useModals();
  const t = useT();

  const addAnnouncement = useCallback(() => {
    openModal({
      title: t('add_announcement', 'Add Announcement'),
      children: (close) => <AddAnnouncementModal close={close} />,
    });
  }, []);

  const importDebugPost = useCallback(() => {
    openModal({
      title: t('import_debug_post', 'Import Debug Post'),
      maxSize: 800,
      children: (close) => <ImportDebugPostModal close={close} />,
    });
  }, []);

  if (!user?.isSuperAdmin) {
    return (
      <div className="text-textColor p-[20px]">
        You do not have access to this page.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[20px] text-textColor">
      <div className="text-[20px] font-[600]">Admin</div>

      <Section title="Costs">
        <div className="grid grid-cols-3 gap-[12px] mobile:grid-cols-1 max-w-[1000px]">
          <XSpendCard />
        </div>
      </Section>

      <Section title="Settings">
        <div className="max-w-[1000px]">
          <SettingsCheckCard />
        </div>
      </Section>

      <Section title="Monitor">
        <div className="grid grid-cols-3 gap-[12px] mobile:grid-cols-1 max-w-[1000px]">
          <LinkCard
            href="/admin/users"
            title="Users"
            text="Every account, plan and channel count. Disable a login."
          />
          <LinkCard
            href="/admin/errors"
            title="Errors"
            text="Publishing and connection errors, by platform."
          />
          <LinkCard
            href="/admin/stats"
            title="Stats"
            text="Posts, channels and errors for a date range."
          />
          <EarlyAccessLinkCard />
        </div>
      </Section>

      <Section title="Tools">
        <div className="grid grid-cols-3 gap-[12px] mobile:grid-cols-1 max-w-[1000px]">
          <ActionCard
            title="Announcements"
            text="Show a banner to every user."
            onClick={addAnnouncement}
          />
          <ActionCard
            title="Import debug post"
            text="Load a post from a debug export to reproduce a problem."
            onClick={importDebugPost}
          />
        </div>
      </Section>

      <Section title="Impersonate a user">
        <div className="max-w-[600px]">
          <ImpersonatePicker />
          <div className="text-[12px] opacity-70 pt-[6px]">
            Opens the app as that user. A red strip across the top shows who you
            are viewing as, with a Stop button.
          </div>
        </div>
      </Section>
    </div>
  );
};
