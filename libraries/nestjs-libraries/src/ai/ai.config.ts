import OpenAI from 'openai';
import { DallEAPIWrapper } from '@langchain/openai';
import type { ChatOpenAIFields } from '@langchain/openai';
import type { OpenAIAdapter } from '@copilotkit/runtime';
import type { z } from 'zod';
import {
  ProviderChatOpenAI,
  structuredCompletion,
  StructuredCompletionParams,
} from '@gitroom/nestjs-libraries/ai/ai.structured';

// The one place the app's AI provider is chosen (docs/GO_LIVE_PLAN.md, AI
// step 2). Text goes to AI_PROVIDER through its OpenAI-compatible chat
// completions endpoint; image generation always goes to OpenAI.
//
//   AI_PROVIDER     openai (default) | anthropic | openrouter
//   AI_API_KEY      falls back to OPENAI_API_KEY / ANTHROPIC_API_KEY / OPENROUTER_API_KEY
//   AI_BASE_URL     per-provider default below
//   AI_TEXT_MODEL   the model for content generation
//   AI_FAST_MODEL   the cheaper model for short classification calls
//   AI_IMAGE_MODEL  OpenAI image model (default chatgpt-image-latest), key OPENAI_API_KEY

export type AiProvider = 'openai' | 'anthropic' | 'openrouter';

type ProviderDefaults = {
  keyEnv: string;
  baseURL?: string;
  textModel: string;
  fastModel: string;
};

const PROVIDERS: Record<AiProvider, ProviderDefaults> = {
  openai: {
    keyEnv: 'OPENAI_API_KEY',
    textModel: 'gpt-4.1',
    fastModel: 'gpt-4.1',
  },
  // Anthropic's OpenAI SDK compatibility endpoint
  // (platform.claude.com/docs/en/api/openai-sdk). There `response_format` is
  // ignored (see ai.structured.ts), `n` must be 1 and a temperature below 1
  // is refused by Claude 4.7+ models.
  anthropic: {
    keyEnv: 'ANTHROPIC_API_KEY',
    baseURL: 'https://api.anthropic.com/v1/',
    textModel: 'claude-sonnet-5-5',
    fastModel: 'claude-haiku-5-5',
  },
  openrouter: {
    keyEnv: 'OPENROUTER_API_KEY',
    baseURL: 'https://openrouter.ai/api/v1',
    // ids as listed by https://openrouter.ai/api/v1/models
    textModel: 'anthropic/claude-sonnet-5.5',
    fastModel: 'anthropic/claude-haiku-5.5',
  },
};

const DEFAULT_IMAGE_MODEL = 'chatgpt-image-latest';

// Clients are built when the modules load, before the env is checked; the
// OpenAI SDK refuses an empty key, so it gets a placeholder that any request
// would fail with (the feature gates below keep requests from being made).
export const PLACEHOLDER_KEY = 'sk-proj-';

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
};

let warnedProvider: string | undefined;

export const aiProvider = (): AiProvider => {
  const value = (env('AI_PROVIDER') || 'openai').toLowerCase();
  if (value in PROVIDERS) {
    return value as AiProvider;
  }
  if (warnedProvider !== value) {
    warnedProvider = value;
    console.warn(
      `AI_PROVIDER="${value}" is not one of ${Object.keys(PROVIDERS).join(
        ', '
      )}; using openai`
    );
  }
  return 'openai';
};

export const aiTextConfig = () => {
  const provider = aiProvider();
  const defaults = PROVIDERS[provider];
  return {
    provider,
    apiKey: env('AI_API_KEY') || env(defaults.keyEnv),
    baseURL: env('AI_BASE_URL') || defaults.baseURL,
    textModel: env('AI_TEXT_MODEL') || defaults.textModel,
    fastModel: env('AI_FAST_MODEL') || defaults.fastModel,
  };
};

export const aiImageModel = () => env('AI_IMAGE_MODEL') || DEFAULT_IMAGE_MODEL;

/** Text features (chat agent, post generation, clipping, slides) have a key for the chosen provider. */
export const aiTextEnabled = () => !!aiTextConfig().apiKey;

/** Image generation always runs on OpenAI. */
export const aiImagesEnabled = () => !!env('OPENAI_API_KEY');

/** OpenAI SDK client pointed at the text provider. */
export const openAiTextClient = () => {
  const { apiKey, baseURL } = aiTextConfig();
  return new OpenAI({ apiKey: apiKey || PLACEHOLDER_KEY, baseURL });
};

/** OpenAI SDK client for images: OpenAI's own endpoint and key, whatever the text provider. */
export const openAiImageClient = () =>
  new OpenAI({ apiKey: env('OPENAI_API_KEY') || PLACEHOLDER_KEY });

/**
 * `client.chat.completions.parse` with a zod schema on OpenAI; on the other
 * providers the schema is asked for in the prompt and the answer validated
 * with the same schema (ai.structured.ts).
 */
export const structuredParse = <T>(
  client: OpenAI,
  params: StructuredCompletionParams,
  schema: z.ZodType<T>,
  name: string,
  options?: Parameters<OpenAI['chat']['completions']['create']>[1]
) =>
  structuredCompletion(
    client,
    aiTextConfig().provider === 'openai',
    params,
    schema,
    name,
    options
  );

/** LangChain chat model on the text provider; `tier: 'fast'` picks AI_FAST_MODEL. */
export const langchainTextModel = (
  opts: Partial<ChatOpenAIFields> = {},
  tier: 'text' | 'fast' = 'text'
) => {
  const { provider, apiKey, baseURL, textModel, fastModel } = aiTextConfig();
  const { temperature, ...rest } = opts;
  return new ProviderChatOpenAI({
    apiKey: apiKey || PLACEHOLDER_KEY,
    model: tier === 'fast' ? fastModel : textModel,
    ...(baseURL ? { configuration: { baseURL } } : {}),
    // Claude 4.7+ answers 400 to any temperature below 1 through the compat endpoint
    ...(temperature === undefined || provider === 'anthropic'
      ? {}
      : { temperature }),
    ...rest,
    promptJsonFallback: provider !== 'openai',
  });
};

/** LangChain image tool on OpenAI. */
export const langchainImageModel = () =>
  new DallEAPIWrapper({
    apiKey: env('OPENAI_API_KEY') || PLACEHOLDER_KEY,
    model: aiImageModel() as any,
  });

/**
 * AI SDK model for Mastra on the text provider. `.chat()` is chat completions
 * on every provider; the bare `openai(model)` form is OpenAI's Responses API,
 * which the others do not have.
 */
// Explicit return type: declaration emit cannot name the inferred type (it
// lives in a nested @ai-sdk/provider copy), which fails the Docker build.
export const aiSdkTextModel = (): ReturnType<
  import('@ai-sdk/openai').OpenAIProvider['chat']
> => {
  const { apiKey, baseURL, textModel } = aiTextConfig();
  // loaded here, not at the top: the orchestrator imports this module (autopost) and has no use for the AI SDK
  const { createOpenAI } =
    require('@ai-sdk/openai') as typeof import('@ai-sdk/openai');
  return createOpenAI({ apiKey: apiKey || PLACEHOLDER_KEY, baseURL }).chat(
    textModel as any
  );
};

/** CopilotKit service adapter on the text provider. */
export const copilotServiceAdapter = (): OpenAIAdapter => {
  // loaded here, not at the top: the orchestrator imports this module (autopost) and has no use for CopilotKit
  const { OpenAIAdapter: Adapter } =
    require('@copilotkit/runtime') as typeof import('@copilotkit/runtime');
  return new Adapter({
    openai: openAiTextClient(),
    model: aiTextConfig().textModel,
  });
};
