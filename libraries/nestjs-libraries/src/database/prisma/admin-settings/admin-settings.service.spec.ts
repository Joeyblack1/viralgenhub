import { AdminSettingsService } from './admin-settings.service';

const run = (env: Record<string, string | undefined>) => {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) {
    if (/^(AI_|ANTHROPIC|OPENAI|OPENROUTER)/.test(k)) delete process.env[k];
  }
  Object.assign(process.env, env);
  try {
    const out = new AdminSettingsService().check(env);
    return Object.fromEntries(out.checks.map((c) => [c.key, c]));
  } finally {
    process.env = saved;
  }
};

describe('AdminSettingsService', () => {
  it('flags everything missing on an empty env', () => {
    const r = run({});
    expect(r.recaptcha.status).toBe('error');
    expect(r.recaptcha.fix).toContain('set-recaptcha.sh');
    expect(r.stripe.status).toBe('warn');
    expect(r.storage.status).toBe('error');
    expect(r.ai.status).toBe('error');
    expect(r['anthropic-key'].detail).toContain('No Anthropic key');
    expect(r.openai.status).toBe('warn');
    expect(r.extension.status).toBe('warn');
    expect(r['hidden-providers'].detail).toBe('0 coming soon, 0 in tester preview.');
  });

  it('is green when configured', () => {
    const r = run({
      RECAPTCHA_SITE_KEY: 'a',
      RECAPTCHA_SECRET_KEY: 'b',
      STRIPE_PUBLISHABLE_KEY: 'c',
      STRIPE_SECRET_KEY: 'd',
      STORAGE_PROVIDER: 'cloudflare',
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-api03-xyz',
      OPENAI_API_KEY: 'sk-proj-1',
      X_MONTHLY_BUDGET_USD: '50',
      X_PAUSE_AT_USD: '45',
      EXTENSION_ID: 'coagigbelglppjcbopmeaapehmgjbffe',
      COMING_SOON_PROVIDERS: 'mewe, tumblr',
      PREVIEW_PROVIDERS: 'facebook',
    });
    for (const k of ['recaptcha', 'stripe', 'storage', 'ai', 'anthropic-key', 'openai', 'x-budget', 'extension']) {
      expect(r[k].status).toBe('ok');
    }
    expect(r.ai.detail).toContain('claude-sonnet-5-5');
    expect(r['hidden-providers'].detail).toBe('2 coming soon, 1 in tester preview.');
  });

  it('needs both reCAPTCHA keys and both Stripe keys', () => {
    const r = run({ RECAPTCHA_SITE_KEY: 'a', STRIPE_SECRET_KEY: 'd' });
    expect(r.recaptcha.status).toBe('error');
    expect(r.stripe.status).toBe('warn');
  });

  it('errors on a non-API Anthropic key when anthropic is the provider', () => {
    const r = run({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-oat01-zzz' });
    expect(r['anthropic-key'].status).toBe('error');
    expect(r['anthropic-key'].detail).toContain('not an API key');
    const other = run({ AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'sk-ant-oat01-zzz' });
    expect(other['anthropic-key'].status).toBe('warn');
  });

  it('warns on local storage and a pause level above the budget', () => {
    const r = run({
      STORAGE_PROVIDER: 'local',
      X_MONTHLY_BUDGET_USD: '40',
      X_PAUSE_AT_USD: '48',
    });
    expect(r.storage.status).toBe('warn');
    expect(r['x-budget'].status).toBe('error');
  });

  it('reads the extension per store from EXTENSION_IDS', () => {
    const r = run({
      EXTENSION_IDS:
        'edge:abcdefghijklmnopabcdefghijklmnop,firefox:viralgenhub',
      EXTENSION_ID: 'coagigbelglppjcbopmeaapehmgjbffe',
    });
    expect(r.extension.status).toBe('ok');
    expect(r.extension.detail).toBe('Extension configured for: chrome, edge, firefox.');
  });

  it('a malformed extension ID does not count as set', () => {
    expect(run({ EXTENSION_ID: 'abc' }).extension.status).toBe('warn');
  });

  it('never includes a secret value in the output', () => {
    const r = run({
      RECAPTCHA_SECRET_KEY: 'SECRET-VALUE-1',
      RECAPTCHA_SITE_KEY: 'SITE-VALUE-2',
      ANTHROPIC_API_KEY: 'sk-ant-api03-SECRET-3',
      AI_PROVIDER: 'anthropic',
    });
    const text = JSON.stringify(r);
    expect(text).not.toContain('SECRET-VALUE-1');
    expect(text).not.toContain('SITE-VALUE-2');
    expect(text).not.toContain('SECRET-3');
  });
});
