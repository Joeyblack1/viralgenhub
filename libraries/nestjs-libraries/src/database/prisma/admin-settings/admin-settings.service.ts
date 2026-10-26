import { Injectable } from '@nestjs/common';
import { aiTextConfig } from '@gitroom/nestjs-libraries/ai/ai.config';
import { getXSpendConfig } from '@gitroom/nestjs-libraries/integrations/social/x.spend';

export type SettingStatus = 'ok' | 'warn' | 'error';

export interface SettingCheck {
  key: string;
  label: string;
  status: SettingStatus;
  detail: string;
  fix?: string;
}

type Env = Record<string, string | undefined>;

const has = (env: Env, name: string) => !!env[name];

const listLength = (env: Env, name: string) =>
  (env[name] || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean).length;

// Reports whether the security and provider settings are in place. It returns
// booleans and short strings only (never a key, secret or URL), because the
// card on /admin renders it as is.
@Injectable()
export class AdminSettingsService {
  check(env: Env = process.env): { checks: SettingCheck[] } {
    const checks: SettingCheck[] = [];

    const recaptcha =
      has(env, 'RECAPTCHA_SITE_KEY') && has(env, 'RECAPTCHA_SECRET_KEY');
    checks.push({
      key: 'recaptcha',
      label: 'reCAPTCHA',
      status: recaptcha ? 'ok' : 'error',
      detail: recaptcha
        ? 'Site and secret keys are set.'
        : 'Keys missing: sign-up and public forms are open to bots.',
      ...(recaptcha ? {} : { fix: 'Set reCAPTCHA keys: ./deploy/app/set-recaptcha.sh' }),
    });

    const stripe =
      has(env, 'STRIPE_PUBLISHABLE_KEY') && has(env, 'STRIPE_SECRET_KEY');
    checks.push({
      key: 'stripe',
      label: 'Stripe',
      status: stripe ? 'ok' : 'warn',
      detail: stripe
        ? 'Publishable and secret keys are set.'
        : 'Keys missing: billing and plans are off.',
      ...(stripe ? {} : { fix: 'Set Stripe keys: ./deploy/app/set-stripe-live.sh' }),
    });

    const storage = env.STORAGE_PROVIDER || '';
    checks.push({
      key: 'storage',
      label: 'Storage',
      status: storage === 'cloudflare' ? 'ok' : storage ? 'warn' : 'error',
      detail: storage
        ? storage === 'cloudflare'
          ? 'Provider: cloudflare.'
          : `Provider: ${storage}. Uploads live on the server disk.`
        : 'STORAGE_PROVIDER is not set.',
      ...(storage === 'cloudflare'
        ? {}
        : { fix: 'Set STORAGE_PROVIDER=cloudflare and the R2 keys in the app env.' }),
    });

    const ai = aiTextConfig();
    const textReady = !!ai.apiKey;
    const anthropicKey = env.ANTHROPIC_API_KEY;
    const anthropicType = !anthropicKey
      ? 'missing'
      : anthropicKey.startsWith('sk-ant-api')
      ? 'api'
      : 'other';
    checks.push({
      key: 'ai',
      label: 'AI text',
      status: textReady ? 'ok' : 'error',
      detail: textReady
        ? `Provider ${ai.provider}, text model ${ai.textModel}, fast model ${ai.fastModel}.`
        : `Provider ${ai.provider} has no API key: the generator and agent are off.`,
      ...(textReady ? {} : { fix: 'Set the AI key: ./deploy/app/set-ai-keys.sh' }),
    });

    const anthropicNeeded = ai.provider === 'anthropic';
    checks.push({
      key: 'anthropic-key',
      label: 'Anthropic key',
      status:
        anthropicType === 'api'
          ? 'ok'
          : anthropicNeeded
          ? 'error'
          : 'warn',
      detail:
        anthropicType === 'api'
          ? 'API key (sk-ant-api...).'
          : anthropicType === 'other'
          ? 'Key is not an API key (not sk-ant-api...). The OpenAI-compatible endpoint refuses it.'
          : 'No Anthropic key set.',
      ...(anthropicType === 'api'
        ? {}
        : { fix: 'Use a Console API key: ./deploy/app/set-ai-keys.sh' }),
    });

    const openai = has(env, 'OPENAI_API_KEY');
    checks.push({
      key: 'openai',
      label: 'OpenAI key (images)',
      status: openai ? 'ok' : 'warn',
      detail: openai
        ? 'Set.'
        : 'Missing: AI image generation is off, whatever the text provider.',
      ...(openai ? {} : { fix: 'Set OPENAI_API_KEY: ./deploy/app/set-ai-keys.sh' }),
    });

    const x = getXSpendConfig(env);
    const xCustom = has(env, 'X_MONTHLY_BUDGET_USD') || has(env, 'X_PAUSE_AT_USD');
    checks.push({
      key: 'x-budget',
      label: 'X spend guard',
      status: x.pauseAtUsd <= x.budgetUsd ? (xCustom ? 'ok' : 'warn') : 'error',
      detail:
        x.pauseAtUsd <= x.budgetUsd
          ? `Budget $${x.budgetUsd}, posting pauses at $${x.pauseAtUsd}${
              xCustom ? '.' : ' (defaults; set the envs to choose).'
            }`
          : `Pause level $${x.pauseAtUsd} is above the budget $${x.budgetUsd}, so it never trips.`,
      ...(x.pauseAtUsd <= x.budgetUsd && xCustom
        ? {}
        : { fix: 'Set X_MONTHLY_BUDGET_USD and X_PAUSE_AT_USD in the app env.' }),
    });

    const extension = has(env, 'EXTENSION_ID');
    checks.push({
      key: 'extension',
      label: 'Browser extension',
      status: extension ? 'ok' : 'warn',
      detail: extension
        ? 'EXTENSION_ID is set.'
        : 'EXTENSION_ID not set: the extension install prompts stay hidden.',
      ...(extension ? {} : { fix: 'Set it once published: ./deploy/app/set-extension-id.sh' }),
    });

    const comingSoon = listLength(env, 'COMING_SOON_PROVIDERS');
    const preview = listLength(env, 'PREVIEW_PROVIDERS');
    checks.push({
      key: 'hidden-providers',
      label: 'Hidden providers',
      status: 'ok',
      detail: `${comingSoon} coming soon, ${preview} in tester preview.`,
    });

    return { checks };
  }
}
