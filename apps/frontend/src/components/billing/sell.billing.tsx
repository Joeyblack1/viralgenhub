'use client';

// ViralGenHub: the "sell" half of the billing page. Benefit headlines, a full
// comparison table, a trust row and a short FAQ. Every number is read from
// `pricing`, so the table can never drift from what the backend enforces.
// Kept in its own file so main.billing.component.tsx stays close to upstream.
import React, { FC, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  pricing,
  SOLD_TIERS,
  planDisplayName,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { FAQSection } from '@gitroom/frontend/components/billing/faq.component';

type Cell = string | boolean;
type Row = { key: string; label: string; cells: Cell[] };
type Group = { key: string; title: string; rows: Row[] };

const tiers = () => SOLD_TIERS.filter((tier) => !!pricing[tier]);

const useComparison = (): Group[] => {
  const t = useT();
  const list = tiers();
  const per = (fn: (tier: (typeof pricing)[string]) => Cell) =>
    list.map((tier) => fn(pricing[tier]));
  const all = list.map(() => true as Cell);
  const unlimited = t('billing_unlimited', 'Unlimited');
  const none = false as Cell;

  return [
    {
      key: 'limits',
      title: t('vgh_cmp_limits', 'Limits'),
      rows: [
        {
          key: 'channels',
          label: t('vgh_cmp_channels', 'Connected channels'),
          cells: per((p) => String(p.channel)),
        },
        {
          key: 'posts',
          label: t('vgh_cmp_posts', 'Posts per month'),
          cells: per((p) =>
            p.posts_per_month > 10000 ? unlimited : String(p.posts_per_month)
          ),
        },
        {
          key: 'xposts',
          label: t('vgh_cmp_x_posts', 'X (Twitter) posts per month'),
          cells: per((p) => (p.x_posts_per_month ? String(p.x_posts_per_month) : none)),
        },
        {
          key: 'team',
          label: t('vgh_cmp_team', 'Team members with roles'),
          cells: per((p) => p.team_members),
        },
      ],
    },
    {
      key: 'publishing',
      title: t('vgh_cmp_publishing', 'Planning and publishing'),
      rows: [
        {
          key: 'platforms',
          label: t('vgh_cmp_platforms', 'Every live platform, TikTok included'),
          cells: all,
        },
        {
          key: 'tiktok',
          label: t('vgh_cmp_tiktok', 'TikTok composer that follows TikTok’s rules'),
          cells: all,
        },
        {
          key: 'calendar',
          label: t('vgh_cmp_calendar', 'Calendar, scheduling and per-platform previews'),
          cells: all,
        },
        {
          key: 'sets',
          label: t('vgh_cmp_sets', 'Sets, Signatures, Repeat posts and Tags'),
          cells: all,
        },
        {
          key: 'media',
          label: t('vgh_cmp_media', 'Media library'),
          cells: all,
        },
        {
          key: 'rss',
          label: t('vgh_cmp_rss', 'Auto-post from RSS feeds'),
          cells: per((p) => p.autoPost),
        },
      ],
    },
    {
      key: 'growth',
      title: t('vgh_cmp_growth', 'Growth and collaboration'),
      rows: [
        {
          key: 'plugs',
          label: t(
            'vgh_cmp_plugs',
            'Plugs automations (Bluesky, X (Twitter), Threads, LinkedIn Pages)'
          ),
          cells: all,
        },
        {
          key: 'short',
          label: t('vgh_cmp_shortlinks', 'Shortlinks with click stats'),
          cells: all,
        },
        {
          key: 'analytics',
          label: t('vgh_cmp_analytics', 'Analytics (on supported platforms)'),
          cells: all,
        },
        {
          key: 'customers',
          label: t('vgh_cmp_customers', 'Customers and preview or approval links'),
          cells: all,
        },
      ],
    },
    {
      key: 'ai',
      title: t('vgh_cmp_ai', 'AI'),
      rows: [
        {
          key: 'ai_writer',
          label: t('vgh_cmp_ai_writer', 'AI post writer and agent (Claude)'),
          cells: per((p) => p.ai),
        },
        {
          key: 'ai_images',
          label: t('vgh_cmp_ai_images', 'AI images per month'),
          cells: per((p) =>
            p.image_generator && p.image_generation_count
              ? String(p.image_generation_count)
              : none
          ),
        },
      ],
    },
    {
      key: 'dev',
      title: t('vgh_cmp_dev', 'Automation and developers'),
      rows: [
        {
          key: 'api',
          label: t('vgh_cmp_api', 'Public API and MCP requests per day'),
          cells: per((p) =>
            !p.public_api
              ? none
              : p.public_api_daily_limit
              ? String(p.public_api_daily_limit)
              : unlimited
          ),
        },
        {
          key: 'webhooks',
          label: t('vgh_cmp_webhooks', 'Webhooks'),
          cells: per((p) => (p.webhooks ? String(p.webhooks) : none)),
        },
      ],
    },
  ];
};

const Tick: FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    className="text-[#8b5cf6] inline-block"
    aria-label="Included"
  >
    <circle cx="10" cy="10" r="7.75" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M7 10.25L9 12.25L13 8.25"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ComparisonTable: FC = () => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const groups = useComparison();
  const list = tiers();
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center justify-between gap-[16px]">
        <div className="text-[18px] font-[600]">
          {t('vgh_compare_plans', 'Compare plans')}
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="h-[36px] px-[14px] rounded-[8px] bg-btnSimple text-btnText text-[14px] font-[500] hover:opacity-80"
        >
          {open
            ? t('vgh_hide_comparison', 'Hide comparison')
            : t('vgh_show_comparison', 'Show full comparison')}
        </button>
      </div>
      {open && (
        <div className="overflow-x-auto rounded-[12px] border border-newTableBorder bg-newBgColorInner">
          <table className="w-full min-w-[560px] text-[14px] border-collapse">
            <thead>
              <tr className="text-start">
                <th className="p-[14px] text-start font-[600]" />
                {list.map((tier) => (
                  <th
                    key={tier}
                    className="p-[14px] text-center font-[600] w-[18%]"
                  >
                    {planDisplayName(tier)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <React.Fragment key={group.key}>
                  <tr>
                    <td
                      colSpan={list.length + 1}
                      className="px-[14px] pt-[18px] pb-[6px] text-[12px] uppercase tracking-wide text-textItemBlur font-[600]"
                    >
                      {group.title}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.key} className="border-t border-newTableBorder">
                      <td className="p-[14px]">{row.label}</td>
                      {row.cells.map((cell, index) => (
                        <td
                          key={list[index]}
                          className="p-[14px] text-center"
                        >
                          {cell === true ? (
                            <Tick />
                          ) : cell === false ? (
                            <span className="text-textItemBlur">–</span>
                          ) : (
                            <span className="font-[600]">{cell}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const BenefitTile: FC<{ title: string; text: string }> = ({ title, text }) => (
  <div className="flex flex-col gap-[6px] rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[20px]">
    <div className="text-[16px] font-[600]">{title}</div>
    <div className="text-[14px] leading-[20px] text-textItemBlur">{text}</div>
  </div>
);

export const BenefitHeadlines: FC = () => {
  const t = useT();
  return (
    <div className="grid grid-cols-4 tablet:grid-cols-2 mobile:!grid-cols-1 gap-[16px]">
      <BenefitTile
        title={t('vgh_benefit_one_place', 'One calendar for every channel')}
        text={t(
          'vgh_benefit_one_place_text',
          'Plan, preview and schedule posts for all your accounts in one place.'
        )}
      />
      <BenefitTile
        title={t('vgh_benefit_tiktok', 'TikTok done properly')}
        text={t(
          'vgh_benefit_tiktok_text',
          'A composer that follows TikTok’s own posting rules, so your posts go out as intended.'
        )}
      />
      <BenefitTile
        title={t('vgh_benefit_team', 'Built for teams and clients')}
        text={t(
          'vgh_benefit_team_text',
          'Roles, customers and preview links let clients approve a post before it goes live.'
        )}
      />
      <BenefitTile
        title={t('vgh_benefit_automate', 'Automate the boring parts')}
        text={t(
          'vgh_benefit_automate_text',
          'Repeat posts, RSS auto-posting, Plugs, webhooks, a public API and MCP.'
        )}
      />
    </div>
  );
};

export const TrustRow: FC = () => {
  const t = useT();
  const items = [
    t('vgh_trust_uk', 'UK company: Talkiru Communications Ltd'),
    t('vgh_trust_stripe', 'Payments by Stripe'),
    t('vgh_trust_cancel', 'Cancel anytime'),
    t(
      'vgh_trust_refund',
      '14-day cooling-off: end early and get the unused part back'
    ),
  ];
  return (
    <div className="grid grid-cols-4 tablet:grid-cols-2 mobile:!grid-cols-1 gap-[12px] rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[16px]">
      {items.map((item) => (
        <div key={item} className="flex items-center gap-[10px] text-[14px]">
          <Tick />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
};

export const SellFaq: FC = () => {
  const t = useT();
  const items = [
    {
      title: t('vgh_faq_cancel', 'Can I cancel anytime?'),
      description: t(
        'vgh_faq_cancel_a',
        'Yes. Cancel from this page with no emails or calls. You keep your plan until the end of the period you paid for, then your account moves to Free.'
      ),
    },
    {
      title: t('vgh_faq_refund', 'Can I get a refund?'),
      description: t(
        'vgh_faq_refund_a',
        'If you cancel within 14 days of first subscribing, you can choose to end the plan straight away and get the unused part of your payment back (the days you have already used are deducted). You will see the choice when you cancel.'
      ),
    },
    {
      title: t('vgh_faq_platforms', 'Which platforms can I post to?'),
      description: t(
        'vgh_faq_platforms_a',
        'Every platform marked live on viralgenhub.com. Some are in preview and others are coming soon; the site always shows the current list.'
      ),
    },
    {
      title: t('vgh_faq_x', 'Why is X (Twitter) limited?'),
      description: t(
        'vgh_faq_x_a',
        'X charges for every post sent through its API, so X (Twitter) posts are capped per month on paid plans and not included in Free. Every other platform is not capped by this limit.'
      ),
    },
    {
      title: t('vgh_faq_switch', 'Can I change plan later?'),
      description: t(
        'vgh_faq_switch_a',
        'Yes. Upgrade, downgrade or switch between monthly and yearly from this page. Yearly billing gives you 2 months free.'
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-[16px]">
      <div className="text-[18px] font-[600]">
        {t('vgh_faq_title', 'Questions about plans')}
      </div>
      <div className={clsx('gap-[16px] flex-col flex select-none')}>
        {items.map((item) => (
          <FAQSection key={item.title} {...item} />
        ))}
      </div>
    </div>
  );
};

export const BillingSell: FC = () => (
  <div className="flex flex-col gap-[32px]">
    <BenefitHeadlines />
    <ComparisonTable />
    <TrustRow />
    <SellFaq />
  </div>
);
