'use client';

import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Subscription } from '@prisma/client';
import { useDebouncedCallback } from 'use-debounce';
import ReactLoading from '@gitroom/frontend/components/layout/loading';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useToaster } from '@gitroom/react/toaster/toaster';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { capitalize } from 'lodash';
import {
  pricing,
  CURRENCY_SYMBOL,
  planDisplayName,
  formatPrice,
  SOLD_TIERS,
  planTagline,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { FAQComponent } from '@gitroom/frontend/components/billing/faq.component';
import {
  useBillingFeatures,
  previousSoldTier,
} from '@gitroom/frontend/components/billing/first.billing.component';
import { BillingHistory } from '@gitroom/frontend/components/billing/billing.history.component';
import useSWR, { useSWRConfig } from 'swr';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Textarea } from '@gitroom/react/form/textarea';
import { useFireEvents } from '@gitroom/helpers/utils/use.fire.events';
import { useUtmUrl } from '@gitroom/helpers/utils/utm.saver';
import { useTrack } from '@gitroom/react/helpers/use.track';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { FinishTrial } from '@gitroom/frontend/components/billing/finish.trial';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { timer } from '@gitroom/helpers/utils/timer';
import { useDubClickId } from '@gitroom/frontend/components/layout/dubAnalytics';
import { LogoutComponent } from '@gitroom/frontend/components/layout/logout.component';

type SubscriptionWithPlatform = Subscription & {
  platform?: 'web' | 'mobile';
};

export const Prorate: FC<{
  period: 'MONTHLY' | 'YEARLY';
  pack: 'STANDARD' | 'PRO';
}> = (props) => {
  const { period, pack } = props;
  const t = useT();
  const fetch = useFetch();
  const [price, setPrice] = useState<number | false>(false);
  const calculatePrice = useDebouncedCallback(async () => {
    setPrice(
      (
        await (
          await fetch('/billing/prorate', {
            method: 'POST',
            body: JSON.stringify({
              period,
              billing: pack,
            }),
          })
        ).json()
      ).price
    );
  }, 500);
  useEffect(() => {
    setPrice(false);
    calculatePrice();
  }, [period, pack]);
  // nothing is shown while the preview loads, the price is missing when it fails
  if (typeof price !== 'number') {
    return null;
  }
  return (
    <div className="animate-fadeIn">
      {t('pay_today', 'Pay Today')} {CURRENCY_SYMBOL}{Math.max(price, 0).toFixed(2)}
    </div>
  );
};

const creditTypes = ['ai_images', 'ai_videos', 'clipping_minutes'] as const;

const useLoadCredits = () => {
  const fetch = useFetch();
  return useCallback(
    async (
      type: (typeof creditTypes)[number]
    ): Promise<{ credits: number }> => {
      const response = await fetch(`/copilot/credits?type=${type}`);
      if (!response.ok) {
        throw new Error('Failed to load credits');
      }
      return response.json();
    },
    []
  );
};

const useCredits = (type: (typeof creditTypes)[number]) => {
  const loadCredits = useLoadCredits();
  return useSWR<{ credits: number }>(
    `/copilot/credits?type=${type}`,
    () => loadCredits(type),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const useRenewal = () => {
  const fetch = useFetch();
  return useSWR<{
    renewsAt: number | null;
    trialing: boolean;
    coolingOffUntil: string | null;
  }>(
    '/billing/renewal',
    async () => {
      const response = await fetch('/billing/renewal');
      if (!response.ok) {
        throw new Error('Failed to load renewal date');
      }
      return response.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

const BillingCycle: FC<{
  tier: string;
  canceled: boolean;
}> = (props) => {
  const { tier, canceled } = props;
  const t = useT();
  const { data: renewal } = useRenewal();
  const { data: images } = useCredits('ai_images');
  const { data: videos } = useCredits('ai_videos');
  const { data: clipping } = useCredits('clipping_minutes');

  const usage = [
    {
      label: t('billing_ai_images', 'AI images'),
      total: pricing[tier]?.image_generation_count,
      left: images?.credits,
    },
    {
      label: t('billing_ai_videos', 'AI videos'),
      total: pricing[tier]?.generate_videos,
      left: videos?.credits,
    },
    {
      label: t('billing_clipping_minutes', 'Clipping minutes'),
      total: pricing[tier]?.clipping_minutes,
      left: clipping?.credits,
    },
  ].filter((p) => p.total);

  return (
    <div className="flex items-center gap-[16px] rounded-[12px] border border-newTableBorder bg-newBgColorInner shadow-previewShadow px-[24px] py-[20px] mobile:flex-col mobile:items-stretch mobile:p-[16px]">
      <div className="w-[48px] h-[48px] rounded-full bg-[#612bd3]/10 text-[#612bd3] flex items-center justify-center shrink-0 mobile:hidden">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </div>
      <div className="flex-1 flex flex-col gap-[4px]">
        <div className="text-[16px] font-[600]">
          {t('billing_cycle', 'Billing cycle')}
        </div>
        <div className="text-[14px] text-textItemBlur">
          {canceled && !!renewal?.renewsAt && (
            <>
              {t(
                'billing_access_until',
                'Your plan stays active until'
              )}{' '}
              <bdi className="font-[600] text-newTextColor">
                {newDayjs(renewal.renewsAt * 1000)
                  .local()
                  .format('D MMM, YYYY')}
              </bdi>
              {'. '}
              {t(
                'billing_then_free',
                'Your account then moves to the Free plan.'
              )}{' '}
            </>
          )}
          {!canceled && !!renewal?.renewsAt && (
            <>
              {renewal.trialing
                ? t(
                    'billing_trial_ends_on',
                    'Your free trial ends and your first payment is charged on'
                  )
                : t('billing_renews_on', 'Your plan renews on')}{' '}
              <bdi className="font-[600] text-newTextColor">
                {newDayjs(renewal.renewsAt * 1000)
                  .local()
                  .format('D MMM, YYYY')}
              </bdi>
              {'. '}
            </>
          )}
          {!!usage.length &&
            t('billing_ai_credits_reset_monthly', 'AI credits reset every month.')}
        </div>
      </div>
      <div className="flex gap-[8px] mobile:flex-col">
        {usage.map((p) => (
          <div
            key={p.label}
            className="flex flex-col gap-[2px] min-w-[120px] rounded-[8px] border border-newTableBorder px-[16px] py-[10px]"
          >
            <div className="text-[12px] text-textItemBlur">{p.label}</div>
            <div className="text-[16px] font-[600]">
              {typeof p.left === 'number' ? Math.max(p.left, 0) : '-'}
              <span className="text-[14px] font-[400] text-textItemBlur">
                {' / '}
                {p.total}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

type PlanAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant: 'primary' | 'simple' | 'current' | 'danger';
};

const planButton = {
  primary: 'bg-btnPrimary text-white hover:bg-[#5023b8]',
  simple: 'bg-btnSimple text-btnText hover:opacity-80',
  current: 'bg-newBgLineColor text-textItemBlur',
  danger: 'bg-red-500 text-white hover:bg-red-600',
};

const PlanCard: FC<{
  name: string;
  price: number;
  yearly: boolean;
  current: boolean;
  action: PlanAction;
  loading: boolean;
  disabled: boolean;
  note?: React.ReactNode;
}> = (props) => {
  const { name, price, yearly, current, action, loading, disabled, note } =
    props;
  const t = useT();
  const features = useBillingFeatures(name);
  const includes = previousSoldTier(name);

  return (
    <div
      className={clsx(
        'relative flex flex-col gap-[20px] rounded-[12px] border p-[24px] mobile:p-[20px]',
        current
          ? 'border-transparent bg-gradient-to-b from-seventh to-btnPrimary text-white shadow-lg shadow-purple-500/25'
          : 'border-newTableBorder bg-newBgColorInner shadow-previewShadow'
      )}
    >
      {[
        'top-[10px] start-[10px]',
        'top-[10px] end-[10px]',
        'bottom-[10px] start-[10px]',
        'bottom-[10px] end-[10px]',
      ].map((position) => (
        <span
          key={position}
          className={clsx(
            'absolute w-[8px] h-[8px] rounded-full border pointer-events-none',
            position,
            current
              ? 'border-white/25 bg-white/10'
              : 'border-newTableBorder bg-newBgColor'
          )}
        />
      ))}
      <div className="flex items-center justify-between gap-[8px] min-h-[26px]">
        <div className="flex flex-col">
          <div className="text-[18px] font-[600]">{planDisplayName(name)}</div>
          {!!planTagline(name) && (
            <div
              className={clsx(
                'text-[12px] leading-[16px]',
                current ? 'text-white/70' : 'text-textItemBlur'
              )}
            >
              {t(`billing_tagline_${name.toLowerCase()}`, planTagline(name))}
            </div>
          )}
        </div>
        {current && (
          <div className="flex items-center gap-[6px] h-[26px] px-[10px] rounded-full bg-white/15 text-[12px] font-[600] uppercase whitespace-nowrap">
            <span className="w-[6px] h-[6px] rounded-full bg-[#32D583]" />
            {t('active', 'Active')}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-[6px]">
        <div className="text-[40px] leading-[48px] font-[600] tracking-tight">
          {CURRENCY_SYMBOL}
          {formatPrice(price)}
        </div>
        <div
          className={clsx(
            'text-[14px]',
            current ? 'text-white/70' : 'text-textItemBlur'
          )}
        >
          {yearly
            ? t('billing_per_year', '/ year')
            : t('billing_per_month', '/ month')}
        </div>
      </div>
      <div className="relative flex flex-col mb-[8px]">
        <button
          type="button"
          onClick={action.onClick}
          disabled={disabled}
          className={clsx(
            'h-[44px] px-[16px] rounded-[8px] text-[15px] font-[600] flex items-center justify-center transition-all',
            current
              ? action.variant === 'current'
                ? 'bg-white/15 text-white'
                : 'bg-white text-btnPrimary hover:bg-white/90'
              : planButton[action.variant],
            disabled ? 'cursor-default' : 'cursor-pointer',
            disabled && action.variant !== 'current' && 'opacity-50'
          )}
        >
          {loading ? (
            <ReactLoading
              type="spin"
              color="currentColor"
              width={18}
              height={18}
            />
          ) : (
            action.label
          )}
        </button>
        {!!note && (
          <div
            className={clsx(
              'absolute top-full inset-x-0 h-[28px] flex items-center justify-center text-[12px]',
              current ? 'text-white/70' : 'text-textItemBlur'
            )}
          >
            {note}
          </div>
        )}
      </div>
      <div
        className={clsx(
          'h-[1px]',
          current ? 'bg-white/15' : 'bg-newTableBorder'
        )}
      />
      <div className="flex flex-col gap-[12px] text-[14px] leading-[20px]">
        {!!includes && (
          <div
            className={clsx(
              'font-[600]',
              current ? 'text-white' : 'text-newTextColor'
            )}
          >
            {t('billing_everything_in_plus', 'Everything in {{plan}}, plus:', {
              plan: planDisplayName(includes),
            })}
          </div>
        )}
        {features.map((feature) => (
          <div
            key={feature.key}
            className={clsx(
              'flex gap-[10px]',
              current ? 'text-white' : 'text-newTextColor/90'
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              className={clsx(
                'shrink-0',
                current ? 'text-white/75' : 'text-[#8b5cf6]'
              )}
            >
              <circle
                cx="10"
                cy="10"
                r="7.75"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M7 10.25L9 12.25L13 8.25"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div>{feature.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Accept: FC<{ resolve: (res: boolean) => void }> = ({ resolve }) => {
  const [loading, setLoading] = useState(false);
  const fetch = useFetch();
  const toaster = useToaster();

  const apply = useCallback(async () => {
    setLoading(true);
    await fetch('/billing/apply-discount', {
      method: 'POST',
    });

    resolve(true);
    toaster.show('50% discount applied successfully');
  }, []);

  return (
    <div>
      <div className="mb-[20px]">
        Would you accept 50% discount for 3 months instead? 🙏🏻
      </div>
      <div className="flex gap-[10px]">
        <Button loading={loading} onClick={apply}>
          Apply 50% discount for 3 months
        </Button>
        <Button onClick={() => resolve(false)} className="!bg-red-800">
          Cancel my subscription
        </Button>
      </div>
    </div>
  );
};
// ViralGenHub #210: inside the 14-day cooling-off the customer picks between
// cancelling at the period end and ending today with a refund of the unused part
const CancelChoice: FC<{
  plan: string;
  paidUntil: string;
  coolingOffUntil: string;
  messages: string[];
  resolve: (choice: 'period' | 'now' | false) => void;
}> = ({ plan, paidUntil, coolingOffUntil, messages, resolve }) => {
  const t = useT();

  return (
    <div className="flex flex-col gap-[16px] max-w-[600px]">
      <div>
        {t(
          'billing_cooling_off_explain',
          'You started your {{plan}} plan less than 14 days ago, so until {{date}} you can end it straight away and get the unused part of your payment back; the days you have already used are deducted.',
          { plan, date: coolingOffUntil }
        )}{' '}
        {t(
          'billing_switch_to_free_limits',
          'Free includes {{channels}} channels and {{posts}} posts a month. If you have more channels, the extra ones are paused until you upgrade again.',
          {
            channels: pricing.FREE.channel,
            posts: pricing.FREE.posts_per_month,
          }
        )}
        {messages.map((m) => ` ${m}.`).join('')}
      </div>
      <div className="flex flex-col gap-[10px]">
        <Button onClick={() => resolve('period')}>
          {paidUntil
            ? t(
                'billing_cancel_at_period_end_until',
                'Cancel at the end of the period (keep access until {{date}})',
                { date: paidUntil }
              )
            : t(
                'billing_cancel_at_period_end',
                'Cancel at the end of the period (keep access until it ends)'
              )}
        </Button>
        <Button className="!bg-red-800" onClick={() => resolve('now')}>
          {t('billing_cancel_now_refund', 'End now and refund the unused part')}
        </Button>
        <Button secondary={true} onClick={() => resolve(false)}>
          {t('billing_keep_plan', 'Keep {{plan}}', { plan })}
        </Button>
      </div>
    </div>
  );
};
const Info: FC<{
  proceed: (feedback: string) => void;
}> = (props) => {
  const [feedback, setFeedback] = useState('');
  const modal = useModals();
  const events = useFireEvents();
  const cancel = useCallback(() => {
    props.proceed(feedback);
    events('cancel_subscription');
    modal.closeAll();
  }, [modal, feedback]);

  const t = useT();

  return (
    <div className="relative flex gap-[20px] flex-col flex-1 rounded-[4px]">
      <div>
        {t(
          'billing_cancel_feedback_optional',
          'Optional: what could we have done better?'
        )}
      </div>
      <div>
        <Textarea
          className="bg-newBgColorInner"
          label={'Feedback'}
          name="feedback"
          disableForm={true}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>
      <div>
        <Button onClick={cancel}>
          {t('billing_switch_to_free_confirm', 'Switch to Free')}
        </Button>
      </div>
    </div>
  );
};
export const MainBillingComponent: FC<{
  sub?: SubscriptionWithPlatform;
}> = (props) => {
  const { sub } = props;
  const { isGeneral, stripeClient } = useVariables();
  // Paid plans open with live Stripe keys only (ViralGenHub #180).
  const paidPlansOpen = !stripeClient?.startsWith('pk_test_');
  const { mutate } = useSWRConfig();
  const fetch = useFetch();
  const toast = useToaster();
  const user = useUser();
  const dub = useDubClickId();
  const modal = useModals();
  const router = useRouter();
  const utm = useUtmUrl();
  const track = useTrack();
  const t = useT();
  const queryParams = useSearchParams();
  const [finishTrial, setFinishTrial] = useState(
    !!queryParams.get('finishTrial')
  );

  const [subscription, setSubscription] = useState<
    SubscriptionWithPlatform | undefined
  >(sub);
  const [loading, setLoading] = useState<boolean>(false);
  // which button started the request, so only that one shows a spinner
  const [clicked, setClicked] = useState('');
  const [period, setPeriod] = useState<'MONTHLY' | 'YEARLY'>(
    subscription?.period || 'MONTHLY'
  );
  const [monthlyOrYearly, setMonthlyOrYearly] = useState<'on' | 'off'>(
    period === 'MONTHLY' ? 'off' : 'on'
  );
  const [initialChannels, setInitialChannels] = useState(
    sub?.totalChannels || 1
  );
  useEffect(() => {
    if (initialChannels !== sub?.totalChannels) {
      setInitialChannels(sub?.totalChannels || 1);
    }
    if (period !== sub?.period) {
      setPeriod(sub?.period || 'MONTHLY');
      setMonthlyOrYearly(
        (sub?.period || 'MONTHLY') === 'MONTHLY' ? 'off' : 'on'
      );
    }
    setSubscription(sub);
  }, [sub]);
  const loadCredits = useLoadCredits();
  const { data: renewal } = useRenewal();
  // the paid plan runs to the end of the period it was paid for, then the account is on Free
  const paidUntil = renewal?.renewsAt
    ? newDayjs(renewal.renewsAt * 1000).local().format('D MMM, YYYY')
    : '';
  // ViralGenHub #210: while the 14-day cooling-off runs, cancelling can also end
  // the plan today with a refund of the unused part
  const coolingOffUntil =
    renewal?.coolingOffUntil &&
    new Date(renewal.coolingOffUntil).getTime() > Date.now()
      ? newDayjs(renewal.coolingOffUntil).local().format('D MMM, YYYY')
      : '';
  // credits follow the plan stored by the Stripe webhook: wait for it, then
  // show the new plan's totals and credits together
  const showConfirmedPlan = useCallback(
    async (billing: string, period: string, attempt = 0) => {
      try {
        const current = await (await fetch('/user/subscription')).json();
        if (
          current?.subscription?.subscriptionTier !== billing ||
          current?.subscription?.period !== period
        ) {
          if (attempt < 9) {
            await timer(1000);
            return showConfirmedPlan(billing, period, attempt + 1);
          }
          return;
        }
        const credits = await Promise.all(creditTypes.map(loadCredits));
        creditTypes.forEach((type, index) =>
          mutate(`/copilot/credits?type=${type}`, credits[index], {
            revalidate: false,
          })
        );
        mutate('/user/subscription', current, { revalidate: false });
      } catch (err) {}
    },
    []
  );
  const updatePayment = useCallback(async () => {
    const { portal } = await (await fetch('/billing/portal')).json();
    window.location.href = portal;
  }, []);
  const currentPackage = useMemo(() => {
    if (!subscription) {
      return 'FREE';
    }
    if (period === 'YEARLY' && monthlyOrYearly === 'off') {
      return '';
    }
    if (period === 'MONTHLY' && monthlyOrYearly === 'on') {
      return '';
    }
    return subscription?.subscriptionTier;
  }, [subscription, initialChannels, monthlyOrYearly, period]);
  const moveToCheckout = useCallback(
    (billing: 'STANDARD' | 'PRO' | 'FREE', reactivate = false) =>
      async () => {
        if (reactivate) {
          setLoading(true);
          const { cancel_at } = await (
            await fetch('/billing/cancel', {
              method: 'POST',
              body: JSON.stringify({
                feedback: '',
              }),
              headers: {
                'Content-Type': 'application/json',
              },
            })
          ).json();
          setSubscription((subs) => ({
            ...subs!,
            cancelAt: cancel_at,
          }));

          toast.show(
            cancel_at
              ? 'Your subscription was already active, so it is now set to cancel. Click Reactivate subscription again to keep it.'
              : 'Subscription reactivated successfully'
          );
          setLoading(false);
          return;
        }

        const messages: string[] = [];
        if (
          !pricing[billing].team_members &&
          pricing[subscription?.subscriptionTier!]?.team_members
        ) {
          let hasMembers = true;
          try {
            const team = await (await fetch('/settings/team')).json();
            hasMembers =
              !Array.isArray(team?.users) ||
              team.users.some(
                (member: { user: { id: string } }) =>
                  member.user.id !== user?.id
              );
          } catch (err: any) {
            // keep the warning when the team cannot be loaded
          }
          if (hasMembers) {
            messages.push(
              `Your team members will be disabled and lose access to your organization until you upgrade to a plan that includes team members again`
            );
          }
        }
        if (billing === 'FREE') {
          const plan = planDisplayName(subscription?.subscriptionTier || '');
          const offerCoolingOff = !subscription?.cancelAt && !!coolingOffUntil;
          const choice: 'period' | 'now' | false = offerCoolingOff
            ? await new Promise((res) => {
                modal.openModal({
                  title: t(
                    'billing_switch_to_free_title',
                    'Cancel subscription and switch to Free?'
                  ),
                  withCloseButton: true,
                  classNames: {
                    modal: 'bg-transparent text-textColor',
                  },
                  onClose: () => res(false),
                  children: (
                    <CancelChoice
                      plan={plan}
                      paidUntil={paidUntil}
                      coolingOffUntil={coolingOffUntil}
                      messages={messages}
                      resolve={res}
                    />
                  ),
                });
              })
            : 'period';
          if (offerCoolingOff) {
            modal.closeAll();
          }
          if (choice === 'now') {
            setLoading(true);
            const response = await fetch('/billing/cancel-now', {
              method: 'POST',
            });
            let result: { refunded?: number; message?: string } = {};
            try {
              result = await response.json();
            } catch (err) {}
            if (!response.ok) {
              toast.show(
                result?.message ||
                  t(
                    'billing_cancel_now_failed',
                    'We could not end your subscription, please try again or contact support.'
                  ),
                'warning'
              );
              setLoading(false);
              return;
            }
            // the subscription is gone on Stripe; the webhook moves the workspace to Free
            setSubscription(undefined);
            mutate(
              '/user/self',
              {
                ...user,
                tier: 'FREE',
              },
              {
                revalidate: false,
              }
            );
            mutate(
              '/user/subscription',
              { subscription: undefined },
              { revalidate: false }
            );
            mutate('/billing/invoices');
            mutate('/billing/renewal');
            toast.show(
              (result.refunded || 0) > 0
                ? t(
                    'billing_cancelled_now_refunded',
                    'Subscription ended. {{amount}} is on its way back to your card; your account is now on the Free plan.',
                    {
                      amount: `${CURRENCY_SYMBOL}${formatPrice(
                        result.refunded / 100
                      )}`,
                    }
                  )
                : t(
                    'billing_cancelled_now',
                    'Subscription ended with nothing due back. Your account is now on the Free plan.'
                  )
            );
            setLoading(false);
            return;
          }
          if (!choice) {
            return;
          }
          if (
            subscription?.cancelAt ||
            offerCoolingOff ||
            (await deleteDialog(
              [
                paidUntil
                  ? t(
                      'billing_switch_to_free_until',
                      'Your {{plan}} plan stays active until {{date}}. After that your account moves to the Free plan and you will not be charged again.',
                      { plan, date: paidUntil }
                    )
                  : t(
                      'billing_switch_to_free_end',
                      'Your {{plan}} plan stays active until the end of the period you have paid for. After that your account moves to the Free plan and you will not be charged again.',
                      { plan }
                    ),
                t(
                  'billing_switch_to_free_limits',
                  'Free includes {{channels}} channels and {{posts}} posts a month. If you have more channels, the extra ones are paused until you upgrade again.',
                  {
                    channels: pricing.FREE.channel,
                    posts: pricing.FREE.posts_per_month,
                  }
                ),
                ...messages.map((m) => `${m}.`),
              ].join(' '),
              t('billing_switch_to_free_confirm', 'Switch to Free'),
              t('billing_switch_to_free_title', 'Cancel subscription and switch to Free?'),
              t('billing_keep_plan', 'Keep {{plan}}', { plan })
            ))
          ) {
            const checkDiscount = await (
              await fetch('/billing/check-discount')
            ).json();
            if (checkDiscount.offerCoupon) {
              const info = await new Promise((res) => {
                modal.openModal({
                  title: 'Before you cancel',
                  withCloseButton: true,
                  classNames: {
                    modal: 'bg-transparent text-textColor',
                  },
                  children: <Accept resolve={res} />,
                });
              });

              modal.closeAll();

              if (info) {
                return;
              }
            }

            const info = await new Promise((res) => {
              modal.openModal({
                title: t(
                  'we_are_sorry_to_see_you_go',
                  'We are sorry to see you go :('
                ),
                withCloseButton: true,
                classNames: {
                  modal: 'bg-transparent text-textColor',
                },
                children: <Info proceed={(e) => res(e)} />,
              });
            });

            setLoading(true);
            const { cancel_at } = await (
              await fetch('/billing/cancel', {
                method: 'POST',
                body: JSON.stringify({
                  feedback: info,
                }),
                headers: {
                  'Content-Type': 'application/json',
                },
              })
            ).json();
            setSubscription((subs) => ({
              ...subs!,
              cancelAt: cancel_at,
            }));
            toast.show(
              cancel_at
                ? t(
                    'billing_switched_to_free',
                    'Subscription cancelled. Your account moves to the Free plan on {{date}}.',
                    {
                      date: newDayjs(cancel_at).local().format('D MMM, YYYY'),
                    }
                  )
                : 'Your subscription was already set to cancel, so it has been reactivated. Click Cancel subscription again to cancel it.'
            );
            setLoading(false);
          }
          return;
        }
        if (
          messages.length &&
          !(await deleteDialog(messages.join(', '), 'Yes, continue'))
        ) {
          return;
        }
        setLoading(true);
        const { url, portal, blocked } = await (
          await fetch('/billing/subscribe', {
            method: 'POST',
            body: JSON.stringify({
              period: monthlyOrYearly === 'on' ? 'YEARLY' : 'MONTHLY',
              utm,
              billing,
              ...(dub ? { dub } : {}),
            }),
          })
        ).json();
        if (blocked) {
          setLoading(false);
          await deleteDialog(
            t(
              'billing_other_account_subscribed',
              'Another account with this email already has an active subscription. Please log off and sign in to that account to manage your subscription.'
            ),
            t('ok', 'OK'),
            t('already_subscribed', 'Already subscribed')
          );
          return;
        }
        if (url) {
          await track(TrackEnum.InitiateCheckout, {
            value:
              pricing[billing][
                monthlyOrYearly === 'on' ? 'year_price' : 'month_price'
              ],
          });
          window.location.href = url;
          return;
        }
        if (portal) {
          if (
            await deleteDialog(
              'We could not charge your credit card, please update your payment method',
              'Update',
              'Payment Method Required'
            )
          ) {
            window.open(portal);
          }
        } else {
          setPeriod(monthlyOrYearly === 'on' ? 'YEARLY' : 'MONTHLY');
          setSubscription((subs) => ({
            ...subs!,
            subscriptionTier: billing,
            cancelAt: null,
          }));
          mutate(
            '/user/self',
            {
              ...user,
              tier: billing,
            },
            {
              revalidate: false,
            }
          );
          mutate('/billing/invoices');
          mutate('/billing/renewal');
          showConfirmedPlan(
            billing,
            monthlyOrYearly === 'on' ? 'YEARLY' : 'MONTHLY'
          );
          toast.show('Subscription updated successfully');
        }
        setLoading(false);
      },
    [monthlyOrYearly, subscription, user, utm, paidUntil, coolingOffUntil]
  );
  if (user?.isLifetime) {
    router.replace('/');
    return null;
  }
  if (subscription?.platform && subscription.platform !== 'web') {
    return (
      <div className="flex flex-col gap-[16px]">
        <div className="text-[20px]">{t('plans', 'Plans')}</div>
        <div className="flex flex-col items-center gap-[8px] rounded-[8px] bg-newBgColorInner p-[24px] text-center">
          <div className="text-[18px]">
            {t('subscription_managed_by', 'Your subscription is managed by')}{' '}
            <span className="capitalize">{subscription.provider}</span>
          </div>
          <div className="text-[14px] opacity-70">
            {t(
              'subscription_manage_on_platform',
              'Please go to {{platform}} to manage it',
              { platform: subscription.platform }
            )}
          </div>
        </div>
        <FAQComponent />
        <div className="flex justify-center mt-[20px]">
          <LogoutComponent />
        </div>
      </div>
    );
  }
  const yearly = monthlyOrYearly === 'on';
  const tiers = Object.keys(pricing).filter((t) => SOLD_TIERS.includes(t));
  const currentTier = subscription?.subscriptionTier || 'FREE';
  // ViralGenHub: Free is shown too, so paid plans can read "Everything in Free, plus".
  const plans = tiers;

  const planAction = (name: string): PlanAction => {
    if (currentPackage === name && subscription?.cancelAt) {
      return {
        label: t('reactivate_subscription', 'Reactivate subscription'),
        onClick: moveToCheckout('FREE', true),
        variant: 'primary',
      };
    }
    if (currentPackage === name) {
      return {
        label: t('billing_current_plan', 'Current Plan'),
        disabled: true,
        variant: 'current',
      };
    }
    if (name === 'FREE') {
      return {
        label: subscription?.cancelAt
          ? t('billing_moves_to_free_on', 'Moves to Free on {{date}}', {
              date: dayjs
                .utc(subscription.cancelAt)
                .local()
                .format('D MMM, YYYY'),
            })
          : t('billing_switch_to_free', 'Switch to Free'),
        onClick: moveToCheckout('FREE'),
        disabled: !!subscription?.cancelAt,
        variant: 'simple',
      };
    }
    if (!subscription && !paidPlansOpen) {
      return {
        label: t('billing_coming_soon', 'Coming soon'),
        disabled: true,
        variant: 'simple',
      };
    }
    const direction = tiers.indexOf(name) - tiers.indexOf(currentTier);
    return {
      label: !subscription
        ? user?.tier?.current === 'FREE' && user.allowTrial
          ? t('start_7_days_free_trial', 'Start 7 days free trial')
          : t('billing_purchase', 'Purchase')
        : direction > 0
        ? t('billing_upgrade', 'Upgrade')
        : direction < 0
        ? t('billing_downgrade', 'Downgrade')
        : yearly
        ? t('billing_switch_to_yearly', 'Switch to yearly')
        : t('billing_switch_to_monthly', 'Switch to monthly'),
      onClick: moveToCheckout(name as 'STANDARD' | 'PRO'),
      variant: !!subscription && direction < 0 ? 'simple' : 'primary',
    };
  };

  return (
    <div className="flex flex-col gap-[24px]">
      {finishTrial && <FinishTrial close={() => setFinishTrial(false)} />}
      <div className="flex items-center gap-[16px] mobile:flex-col mobile:items-stretch">
        <div className="flex-1 flex flex-col gap-[4px]">
          <div className="text-[20px] font-[600]">
            {t('billing_and_subscription', 'Billing & Subscription')}
          </div>
          <div className="text-[14px] text-textItemBlur">
            {t(
              'billing_and_subscription_description',
              'Keep track of your subscription, update your payment method and download your invoices'
            )}
          </div>
        </div>
        <div className="flex p-[4px] border border-newTableBorder rounded-[8px] text-[14px] font-[500] select-none">
          <div
            onClick={() => setMonthlyOrYearly('off')}
            className={clsx(
              'h-[34px] px-[16px] rounded-[6px] flex items-center justify-center mobile:flex-1',
              !yearly ? 'bg-boxFocused text-textItemFocused' : 'cursor-pointer'
            )}
          >
            {t('billing_monthly', 'Monthly')}
          </div>
          <div
            onClick={() => setMonthlyOrYearly('on')}
            className={clsx(
              'h-[34px] px-[16px] rounded-[6px] flex items-center justify-center gap-[8px] mobile:flex-1',
              yearly ? 'bg-boxFocused text-textItemFocused' : 'cursor-pointer'
            )}
          >
            {t('billing_yearly', 'Yearly')}
            <div className="bg-[#AA0FA4] text-white text-[12px] px-[6px] rounded-[4px]">
              {t('billing_two_months_free', '2 months free')}
            </div>
          </div>
        </div>
      </div>
      {subscription?.cancelAt && isGeneral && (
        <div className="flex items-center gap-[12px] rounded-[12px] border border-[#FFAC30]/30 bg-[#FFAC30]/10 px-[16px] py-[12px] text-[14px]">
          <div className="w-[8px] h-[8px] rounded-full bg-[#FFAC30] shrink-0" />
          <div>
            {t('billing_plan_ends_on', 'Your {{plan}} plan ends on', {
              plan: planDisplayName(subscription.subscriptionTier),
            })}{' '}
            <bdi className="font-[600]">
              {newDayjs(subscription.cancelAt).local().format('D MMM, YYYY')}
            </bdi>
            {'. '}
            {t(
              'billing_then_free',
              'Your account then moves to the Free plan and you will not be charged again.'
            )}
          </div>
        </div>
      )}
      <div
        className={clsx(
          'grid gap-[16px] tablet:grid-cols-2 mobile:!grid-cols-1',
          plans.length > 4
            ? 'grid-cols-5'
            : plans.length === 4
            ? 'grid-cols-4'
            : 'grid-cols-3'
        )}
      >
        {plans.map((name) => {
          const action = planAction(name);
          return (
            <PlanCard
              key={name}
              name={name}
              price={
                yearly ? pricing[name].year_price : pricing[name].month_price
              }
              yearly={yearly}
              current={currentPackage === name}
              action={{
                ...action,
                onClick: () => {
                  setClicked(name);
                  action.onClick?.();
                },
              }}
              loading={loading && clicked === name}
              disabled={!!action.disabled || loading}
              note={
                !!subscription &&
                currentPackage !== name &&
                (name === 'FREE' ? (
                  !subscription.cancelAt &&
                  !!paidUntil &&
                  t('billing_free_from', 'From {{date}}, when your current plan ends', {
                    date: paidUntil,
                  })
                ) : (
                  <Prorate
                    period={yearly ? 'YEARLY' : 'MONTHLY'}
                    pack={name as 'STANDARD' | 'PRO'}
                  />
                ))
              }
            />
          );
        })}
      </div>
      {!!subscription?.id && (
        <BillingCycle
          tier={sub?.subscriptionTier || subscription.subscriptionTier}
          canceled={!!subscription.cancelAt}
        />
      )}
      {!!subscription?.id && (
        <div className="flex items-center gap-[16px] rounded-[12px] border border-newTableBorder bg-newBgColorInner shadow-previewShadow px-[24px] py-[20px] mobile:flex-col mobile:items-stretch mobile:p-[16px]">
          <div className="w-[48px] h-[48px] rounded-full bg-[#612bd3]/10 text-[#612bd3] flex items-center justify-center shrink-0 mobile:hidden">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M2 10h20M6 15h4" />
            </svg>
          </div>
          <div className="flex-1 flex flex-col gap-[4px]">
            <div className="text-[16px] font-[600]">
              {t('billing_payment_method', 'Payment method')}
            </div>
            <div className="text-[14px] text-textItemBlur">
              {t(
                'billing_payment_method_description',
                'Update your card, billing address and tax details in the secure billing portal'
              )}
            </div>
          </div>
          <div className="flex items-center gap-[8px] mobile:flex-col-reverse mobile:items-stretch">
            {isGeneral && !subscription?.cancelAt && (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setClicked('CANCEL');
                  moveToCheckout('FREE')();
                }}
                className="h-[44px] px-[16px] rounded-[8px] border border-red-500/40 text-red-500 text-[14px] font-[500] flex items-center justify-center hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {loading && clicked === 'CANCEL' ? (
                  <ReactLoading
                    type="spin"
                    color="currentColor"
                    width={18}
                    height={18}
                  />
                ) : (
                  t('cancel_subscription_1', 'Cancel subscription')
                )}
              </button>
            )}
            <button
              type="button"
              onClick={updatePayment}
              className="h-[44px] px-[16px] rounded-[8px] bg-btnSimple text-btnText text-[14px] font-[500] hover:opacity-80 transition-opacity"
            >
              {t('billing_update_payment_method', 'Update payment method')}
            </button>
          </div>
        </div>
      )}
      {!!subscription?.id && <BillingHistory />}
      <FAQComponent />
      <div className="flex justify-center mt-[20px]">
        <LogoutComponent />
      </div>
    </div>
  );
};
