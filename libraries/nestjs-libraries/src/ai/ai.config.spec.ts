import { z } from 'zod';

// the LangChain client is not needed to check the env handling
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    fields: any;
    constructor(fields: any) {
      this.fields = fields;
    }
    withStructuredOutput() {
      return 'native';
    }
  },
  DallEAPIWrapper: jest.fn().mockImplementation((fields: any) => ({ fields })),
}));

import {
  aiImageModel,
  aiImagesEnabled,
  aiTextConfig,
  aiTextEnabled,
  langchainImageModel,
  langchainTextModel,
  openAiImageClient,
  openAiTextClient,
  PLACEHOLDER_KEY,
  structuredParse,
} from './ai.config';
import {
  extractJson,
  parseStructuredText,
  structuredCompletion,
} from './ai.structured';

const AI_VARS = [
  'AI_PROVIDER',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_TEXT_MODEL',
  'AI_FAST_MODEL',
  'AI_IMAGE_MODEL',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
];

const setEnv = (vars: Record<string, string>) => {
  for (const name of AI_VARS) {
    delete process.env[name];
  }
  Object.assign(process.env, vars);
};

describe('aiTextConfig', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.restoreAllMocks();
  });

  it('defaults to OpenAI with the models the app used before', () => {
    setEnv({ OPENAI_API_KEY: 'sk-openai' });
    expect(aiTextConfig()).toEqual({
      provider: 'openai',
      apiKey: 'sk-openai',
      baseURL: undefined,
      textModel: 'gpt-4.1',
      fastModel: 'gpt-4.1',
    });
  });

  it('anthropic: compat base URL, ANTHROPIC_API_KEY, current Sonnet and Haiku', () => {
    setEnv({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant' });
    expect(aiTextConfig()).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-ant',
      baseURL: 'https://api.anthropic.com/v1/',
      textModel: 'claude-sonnet-5-5',
      fastModel: 'claude-haiku-5-5',
    });
  });

  it('openrouter: its base URL, OPENROUTER_API_KEY, vendor-prefixed ids', () => {
    setEnv({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'sk-or' });
    expect(aiTextConfig()).toEqual({
      provider: 'openrouter',
      apiKey: 'sk-or',
      baseURL: 'https://openrouter.ai/api/v1',
      textModel: 'anthropic/claude-sonnet-5.5',
      fastModel: 'anthropic/claude-haiku-5.5',
    });
  });

  it('AI_API_KEY wins over the provider key; the other providers’ keys are ignored', () => {
    setEnv({
      AI_PROVIDER: 'anthropic',
      AI_API_KEY: 'sk-explicit',
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: 'sk-openai',
    });
    expect(aiTextConfig().apiKey).toBe('sk-explicit');

    setEnv({ AI_PROVIDER: 'anthropic', OPENAI_API_KEY: 'sk-openai' });
    expect(aiTextConfig().apiKey).toBeUndefined();
  });

  it('AI_BASE_URL, AI_TEXT_MODEL and AI_FAST_MODEL override the defaults', () => {
    setEnv({
      AI_PROVIDER: 'ANTHROPIC',
      AI_BASE_URL: 'https://proxy.example/v1',
      AI_TEXT_MODEL: 'claude-opus-5-5',
      AI_FAST_MODEL: 'claude-sonnet-5-5',
    });
    expect(aiTextConfig()).toMatchObject({
      provider: 'anthropic',
      baseURL: 'https://proxy.example/v1',
      textModel: 'claude-opus-5-5',
      fastModel: 'claude-sonnet-5-5',
    });
  });

  it('an unknown AI_PROVIDER warns once and behaves as openai', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setEnv({ AI_PROVIDER: 'gemini', OPENAI_API_KEY: 'sk-openai' });
    expect(aiTextConfig().provider).toBe('openai');
    expect(aiTextConfig().apiKey).toBe('sk-openai');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('empty strings count as unset', () => {
    setEnv({ AI_PROVIDER: '', AI_API_KEY: '', OPENAI_API_KEY: '' });
    expect(aiTextConfig()).toMatchObject({
      provider: 'openai',
      apiKey: undefined,
    });
  });
});

describe('feature gates', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('text follows the chosen provider, images always follow OPENAI_API_KEY', () => {
    setEnv({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant' });
    expect(aiTextEnabled()).toBe(true);
    expect(aiImagesEnabled()).toBe(false);

    setEnv({ AI_PROVIDER: 'anthropic', OPENAI_API_KEY: 'sk-openai' });
    expect(aiTextEnabled()).toBe(false);
    expect(aiImagesEnabled()).toBe(true);

    setEnv({});
    expect(aiTextEnabled()).toBe(false);
    expect(aiImagesEnabled()).toBe(false);
  });

  it('AI_IMAGE_MODEL defaults to chatgpt-image-latest', () => {
    setEnv({});
    expect(aiImageModel()).toBe('chatgpt-image-latest');
    setEnv({ AI_IMAGE_MODEL: 'gpt-image-1' });
    expect(aiImageModel()).toBe('gpt-image-1');
  });
});

describe('client factories', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('the text client points at the provider, the image client at OpenAI', () => {
    setEnv({
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: 'sk-openai',
    });
    const text = openAiTextClient();
    expect(text.baseURL).toBe('https://api.anthropic.com/v1/');
    expect(text.apiKey).toBe('sk-ant');

    const images = openAiImageClient();
    expect(images.baseURL).toBe('https://api.openai.com/v1');
    expect(images.apiKey).toBe('sk-openai');
  });

  it('without a key the clients get the placeholder, as the code did before', () => {
    setEnv({});
    expect(openAiTextClient().apiKey).toBe(PLACEHOLDER_KEY);
    expect(openAiImageClient().apiKey).toBe(PLACEHOLDER_KEY);
  });

  it('LangChain: text model, base URL and the prompt-JSON fallback off OpenAI; no temperature on anthropic', () => {
    setEnv({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant' });
    const anthropic: any = langchainTextModel({ temperature: 0.7 });
    expect(anthropic.fields).toMatchObject({
      apiKey: 'sk-ant',
      model: 'claude-sonnet-5-5',
      configuration: { baseURL: 'https://api.anthropic.com/v1/' },
    });
    expect(anthropic.fields.temperature).toBeUndefined();
    expect(anthropic.fields.promptJsonFallback).toBeUndefined();
    expect(anthropic.promptJsonFallback).toBe(true);

    const fast: any = langchainTextModel({ temperature: 0 }, 'fast');
    expect(fast.fields.model).toBe('claude-haiku-5-5');

    setEnv({ OPENAI_API_KEY: 'sk-openai' });
    const openai: any = langchainTextModel({ temperature: 0.7 });
    expect(openai.fields).toMatchObject({
      apiKey: 'sk-openai',
      model: 'gpt-4.1',
      temperature: 0.7,
    });
    expect(openai.fields.configuration).toBeUndefined();
    expect(openai.promptJsonFallback).toBe(false);
    expect(openai.withStructuredOutput(z.object({}))).toBe('native');
  });

  it('LangChain image tool: OpenAI key and the image model', () => {
    setEnv({
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: 'sk-openai',
    });
    expect((langchainImageModel() as any).fields).toEqual({
      apiKey: 'sk-openai',
      model: 'chatgpt-image-latest',
    });
  });
});

describe('structured output', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const schema = z.object({ posts: z.array(z.string()) });

  it('extractJson finds the object in fences or prose', () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
    expect(extractJson('Here you go: {"a": {"b": 2}} hope it helps')).toBe(
      '{"a": {"b": 2}}'
    );
    expect(extractJson('[1, 2]')).toBe('[1, 2]');
    expect(() => extractJson('no json here')).toThrow();
  });

  it('parseStructuredText validates with the zod schema', () => {
    expect(parseStructuredText('{"posts": ["a", "b"]}', schema)).toEqual({
      posts: ['a', 'b'],
    });
    expect(() => parseStructuredText('{"posts": "a"}', schema)).toThrow();
  });

  it('on OpenAI it uses the native response_format and the parsed message', async () => {
    const parse = jest.fn().mockResolvedValue({
      choices: [{ message: { parsed: { posts: ['x'] } } }],
    });
    const create = jest.fn();
    const client: any = { chat: { completions: { parse, create } } };
    const params = {
      model: 'gpt-4.1',
      messages: [{ role: 'user' as const, content: 'hi' }],
    };

    const result = await structuredCompletion(
      client,
      true,
      params,
      schema,
      'posts',
      { timeout: 5 }
    );

    expect(result).toEqual({ posts: ['x'] });
    expect(create).not.toHaveBeenCalled();
    const [sent, options] = parse.mock.calls[0];
    expect(sent.response_format.type).toBe('json_schema');
    expect(sent.response_format.json_schema.name).toBe('posts');
    expect(sent.messages).toEqual(params.messages);
    expect(options).toEqual({ timeout: 5 });
  });

  it('off OpenAI it asks for the JSON in the prompt and validates the answer', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        { message: { content: 'Sure!\n```json\n{"posts": ["y"]}\n```' } },
      ],
    });
    const parse = jest.fn();
    const client: any = { chat: { completions: { parse, create } } };
    const params = {
      model: 'claude-sonnet-5-5',
      messages: [{ role: 'user' as const, content: 'hi' }],
    };

    const result = await structuredCompletion(
      client,
      false,
      params,
      schema,
      'posts'
    );

    expect(result).toEqual({ posts: ['y'] });
    expect(parse).not.toHaveBeenCalled();
    const [sent] = create.mock.calls[0];
    expect(sent.response_format).toBeUndefined();
    expect(sent.messages).toHaveLength(2);
    expect(sent.messages[0]).toEqual(params.messages[0]);
    expect(sent.messages[1].role).toBe('system');
    expect(sent.messages[1].content).toContain('"posts"');
    expect(sent.messages[1].content).toContain('JSON');
  });

  it('structuredParse picks the path from AI_PROVIDER', async () => {
    const parse = jest
      .fn()
      .mockResolvedValue({ choices: [{ message: { parsed: { posts: [] } } }] });
    const create = jest
      .fn()
      .mockResolvedValue({
        choices: [{ message: { content: '{"posts":[]}' } }],
      });
    const client: any = { chat: { completions: { parse, create } } };
    const params = {
      model: 'm',
      messages: [{ role: 'user' as const, content: 'hi' }],
    };

    setEnv({ OPENAI_API_KEY: 'sk-openai' });
    await structuredParse(client, params, schema, 'posts');
    expect(parse).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();

    setEnv({ AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'sk-or' });
    await structuredParse(client, params, schema, 'posts');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
