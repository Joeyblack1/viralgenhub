import { pricing } from './pricing';
import {
  hasFeature,
  lockedFeatureLine,
  lockedPlansText,
  plansWith,
} from './plan.locks';

describe('plan locks', () => {
  it('names the plans that include each locked feature, from the pricing table', () => {
    expect(plansWith('ai')).toEqual(['TEAM']);
    expect(lockedFeatureLine('ai')).toBe('Available on Business');
    expect(lockedPlansText('ai')).toBe('Business');
    expect(lockedPlansText('import_from_channels')).toBe('Creator and Business');
    expect(lockedFeatureLine('image_generator')).toBe('Available on Business');
    expect(lockedFeatureLine('team_members')).toBe('Available on Business');
    expect(lockedFeatureLine('autoPost')).toBe('Available on Business');
    // webhooks: Free has 1, so every sold plan includes it
    expect(lockedFeatureLine('webhooks')).toBe(
      'Available on Free, Creator and Business'
    );
    expect(lockedFeatureLine('import_from_channels')).toBe(
      'Available on Creator and Business'
    );
  });

  it('Free does not have the Business-only features (the locks show for Free)', () => {
    for (const feature of ['ai', 'image_generator', 'team_members', 'autoPost'] as const) {
      expect(hasFeature(pricing.FREE, feature)).toBe(false);
      expect(hasFeature(pricing.STANDARD, feature)).toBe(false);
      expect(hasFeature(pricing.TEAM, feature)).toBe(true);
    }
    expect(hasFeature(undefined, 'ai')).toBe(false);
  });

  it('never advertises a feature that no sold plan includes', () => {
    // generate_videos is 0 on every sold plan; it is not a LockableFeature,
    // and a feature with no plan gives an empty line
    const original = pricing.TEAM.ai;
    try {
      pricing.TEAM.ai = false;
      expect(plansWith('ai')).toEqual([]);
      expect(lockedFeatureLine('ai')).toBe('');
      expect(lockedPlansText('ai')).toBe('');
    } finally {
      pricing.TEAM.ai = original;
    }
  });
});
