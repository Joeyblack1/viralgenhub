import 'reflect-metadata';

// bcrypt's native binding is not what is under test
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));

import {
  containsUrl,
  estimateXSpend,
  getXSpendConfig,
  isXPostingPaused,
  registerXSpendSource,
  xPausedMessage,
  xSpendMonthRange,
} from './x.spend';
import { XProvider } from './x.provider';

const config = { budgetUsd: 50, pauseAtUsd: 48 };
const now = new Date('2026-10-25T12:00:00Z');

describe('containsUrl', () => {
  it('finds http(s) urls, bare domains and anchors', () => {
    expect(containsUrl('<p>see https://viralgenhub.com/x</p>')).toBe(true);
    expect(containsUrl('<p>see viralgenhub.com</p>')).toBe(true);
    expect(containsUrl('<p>see www.example.co.uk/path?a=1</p>')).toBe(true);
    expect(containsUrl('<a href="http://a.test/x">click</a>')).toBe(true);
  });

  it('does not flag plain text', () => {
    expect(containsUrl('<p>Launch day, e.g. today. Ready.Set go</p>')).toBe(
      false
    );
    expect(containsUrl('')).toBe(false);
  });
});

describe('estimateXSpend', () => {
  it('prices $0.015 a post and $0.20 a post with a link', () => {
    const spend = estimateXSpend(
      ['<p>one</p>', '<p>two</p>', '<p>go to https://a.com</p>'],
      now,
      config,
      false
    );
    expect(spend).toEqual({
      month: '2026-10',
      posts: 3,
      linkPosts: 1,
      estimatedUsd: 0.23,
      ...config,
    });
  });

  it('is zero with no posts', () => {
    expect(estimateXSpend([], now, config, false).estimatedUsd).toBe(0);
  });

  it('bills no link posts when links are stripped before sending', () => {
    const spend = estimateXSpend(['https://a.com'], now, config, true);
    expect(spend.linkPosts).toBe(0);
    expect(spend.estimatedUsd).toBe(0.02);
  });

  it('reads the budget and pause line from the env with defaults', () => {
    expect(getXSpendConfig({})).toEqual({ budgetUsd: 50, pauseAtUsd: 48 });
    expect(
      getXSpendConfig({ X_MONTHLY_BUDGET_USD: '100', X_PAUSE_AT_USD: '90' })
    ).toEqual({ budgetUsd: 100, pauseAtUsd: 90 });
    expect(getXSpendConfig({ X_PAUSE_AT_USD: 'abc' }).pauseAtUsd).toBe(48);
  });

  it('uses the UTC calendar month', () => {
    const { from, to } = xSpendMonthRange(new Date('2026-12-31T23:30:00Z'));
    expect(from.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('X posting guard', () => {
  const source = (estimatedUsd: number) =>
    jest.fn().mockResolvedValue({
      month: '2026-10',
      posts: 0,
      linkPosts: 0,
      estimatedUsd,
      ...config,
    });

  afterEach(() => registerXSpendSource(undefined));

  it('is off when no source is registered', async () => {
    expect(await isXPostingPaused(now)).toBe(false);
  });

  it('allows posts under the pause line and pauses at it', async () => {
    registerXSpendSource(source(47.99));
    expect(await isXPostingPaused(now)).toBe(false);
    registerXSpendSource(source(48));
    expect(await isXPostingPaused(now)).toBe(true);
  });

  it('fails open when the estimate cannot be read', async () => {
    registerXSpendSource(jest.fn().mockRejectedValue(new Error('db down')));
    expect(await isXPostingPaused(now)).toBe(false);
  });

  it('names the date to reschedule after', () => {
    expect(xPausedMessage(now)).toBe(
      'ViralGenHub has paused X posting until next month (X API budget reached). Your post was not sent; reschedule it after 1 November 2026.'
    );
  });

  it('postPending fails with a non-retrying BadBody before any upload', async () => {
    registerXSpendSource(source(60));
    const provider = new XProvider();
    const getClient = jest.spyOn(provider as any, 'getClient');
    await expect(
      provider.postPending('id', 'tok:sec', [{ id: '1', message: 'hi' } as any], {
        profile: 'p',
      } as any)
    ).rejects.toMatchObject({
      nonRetryable: true,
      type: 'bad_body',
      message: expect.stringContaining('ViralGenHub has paused X posting'),
    });
    expect(getClient).not.toHaveBeenCalled();
  });
});
