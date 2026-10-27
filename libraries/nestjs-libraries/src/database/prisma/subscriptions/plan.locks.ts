// ViralGenHub (Joseph, 27 Oct 2026): Free users see every feature, including the
// ones their plan does not include, with a lock and the plan that includes it.
// The plan names come from `pricing`, so the lock text cannot drift from what
// the backend actually allows. Display only: the server-side checks
// (permissions.service.ts) are unchanged.
import {
  planDisplayName,
  pricing,
  PricingInnerInterface,
  SOLD_TIERS,
} from './pricing';

export type LockableFeature =
  | 'ai'
  | 'image_generator'
  | 'team_members'
  | 'autoPost'
  | 'webhooks'
  | 'import_from_channels';

// Sold plans that include `feature`, cheapest first (e.g. ['TEAM']).
export const plansWith = (feature: LockableFeature): string[] =>
  SOLD_TIERS.filter(
    (tier) => !!(pricing[tier] as PricingInnerInterface)?.[feature]
  );

export const hasFeature = (
  tier: Partial<PricingInnerInterface> | undefined | null,
  feature: LockableFeature
) => !!tier?.[feature];

// "Business" / "Creator and Business"; '' when no sold plan has the feature
// (then the control should stay hidden: never advertise a feature nobody can
// buy).
export const lockedPlansText = (feature: LockableFeature): string => {
  const names = plansWith(feature).map(planDisplayName);
  if (names.length <= 1) {
    return names[0] || '';
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

// "Available on Business" / "Available on Creator and Business" / ''.
export const lockedFeatureLine = (feature: LockableFeature): string => {
  const plans = lockedPlansText(feature);
  return plans ? `Available on ${plans}` : '';
};
