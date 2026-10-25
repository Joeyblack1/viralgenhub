import type OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import { ChatOpenAI, ChatOpenAIFields } from '@langchain/openai';
import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { Runnable, RunnableLambda } from '@langchain/core/runnables';
import type {
  BaseLanguageModelInput,
  StructuredOutputMethodOptions,
} from '@langchain/core/language_models/base';
import type { InteropZodType } from '@langchain/core/utils/types';
import type { SerializableSchema } from '@langchain/core/utils/standard_schema';

// Structured output that works on every text provider (ViralGenHub, AI step 2).
//
// OpenAI honours `response_format: json_schema`. Anthropic's OpenAI-compatible
// endpoint ignores `response_format` altogether (platform.claude.com/docs/en/
// api/openai-sdk, "Request fields") and OpenRouter only forwards it to some
// models, so off OpenAI the schema is asked for in the prompt instead and the
// answer is parsed and validated with the same zod schema. One helper for the
// OpenAI SDK (`structuredCompletion`) and one for LangChain
// (`ProviderChatOpenAI.withStructuredOutput`); the prompts are untouched.

type JsonSchemaLike = Record<string, any>;
type RequestOptions = Parameters<OpenAI['chat']['completions']['create']>[1];

export type StructuredCompletionParams = Omit<
  ChatCompletionCreateParamsNonStreaming,
  'response_format'
>;

const isZodSchema = (schema: unknown): schema is z.ZodTypeAny =>
  typeof (schema as any)?.parse === 'function' &&
  typeof (schema as any)?.safeParse === 'function';

/** The JSON schema of a zod schema (via the OpenAI helper, so it is the same schema the native path sends), or the JSON schema itself. */
export const jsonSchemaOf = (
  schema: z.ZodTypeAny | JsonSchemaLike,
  name = 'output'
): JsonSchemaLike =>
  isZodSchema(schema)
    ? (zodResponseFormat(schema, name).json_schema.schema as JsonSchemaLike)
    : schema;

export const jsonOnlyInstruction = (schema: JsonSchemaLike) =>
  `Answer with one JSON object only: no words before or after it and no markdown code fence. The object must match this JSON schema exactly:\n${JSON.stringify(
    schema
  )}`;

/** The JSON object or array in a model answer, which may be wrapped in a code fence or prose. */
export const extractJson = (text: string): string => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/[[{]/);
  if (start < 0) {
    throw new Error('The model answer contains no JSON');
  }
  const end = body.lastIndexOf(body[start] === '[' ? ']' : '}');
  if (end <= start) {
    throw new Error('The model answer contains unterminated JSON');
  }
  return body.slice(start, end + 1);
};

/** Parses a model answer and validates it against the schema (zod), or returns the parsed JSON as is (JSON schema). */
export const parseStructuredText = <T>(
  text: string | null | undefined,
  schema: z.ZodType<T> | JsonSchemaLike
): T => {
  const raw = JSON.parse(extractJson(text || ''));
  return isZodSchema(schema) ? (schema as z.ZodType<T>).parse(raw) : raw;
};

/**
 * `client.chat.completions.parse` with a zod response format when the provider
 * supports it, the prompt fallback otherwise. Resolves to the parsed object,
 * or null when the native path returns no parsed message (refusal).
 */
export async function structuredCompletion<T>(
  client: OpenAI,
  nativeResponseFormat: boolean,
  params: StructuredCompletionParams,
  schema: z.ZodType<T>,
  name: string,
  options?: RequestOptions
): Promise<T | null> {
  if (nativeResponseFormat) {
    const completion = await client.chat.completions.parse(
      { ...params, response_format: zodResponseFormat(schema, name) },
      options
    );
    return (completion.choices[0]?.message.parsed as T | null) ?? null;
  }

  const instruction: ChatCompletionMessageParam = {
    role: 'system',
    content: jsonOnlyInstruction(jsonSchemaOf(schema, name)),
  };
  const completion = await client.chat.completions.create(
    { ...params, messages: [...params.messages, instruction] },
    options
  );
  return parseStructuredText(completion.choices[0]?.message.content, schema);
}

export interface ProviderChatOpenAIFields extends ChatOpenAIFields {
  /** true when the endpoint behind `configuration.baseURL` does not honour `response_format` */
  promptJsonFallback?: boolean;
}

const messageText = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
    ? content
        .filter((block: any) => block?.type === 'text')
        .map((block: any) => block.text)
        .join('')
    : '';

/** ChatOpenAI whose `withStructuredOutput` asks for the JSON in the prompt on providers without `response_format`. */
export class ProviderChatOpenAI extends ChatOpenAI {
  private readonly promptJsonFallback: boolean;

  constructor(fields?: ProviderChatOpenAIFields) {
    const { promptJsonFallback, ...rest } = fields ?? {};
    super(rest);
    this.promptJsonFallback = !!promptJsonFallback;
  }

  // the same three overloads as ChatOpenAI, so call sites keep their types
  withStructuredOutput<
    RunOutput extends Record<string, any> = Record<string, any>
  >(
    outputSchema:
      | InteropZodType<RunOutput>
      | SerializableSchema<RunOutput>
      | Record<string, any>,
    config?: StructuredOutputMethodOptions<false>
  ): Runnable<BaseLanguageModelInput, RunOutput>;
  withStructuredOutput<
    RunOutput extends Record<string, any> = Record<string, any>
  >(
    outputSchema:
      | InteropZodType<RunOutput>
      | SerializableSchema<RunOutput>
      | Record<string, any>,
    config?: StructuredOutputMethodOptions<true>
  ): Runnable<BaseLanguageModelInput, { raw: BaseMessage; parsed: RunOutput }>;
  withStructuredOutput<
    RunOutput extends Record<string, any> = Record<string, any>
  >(
    outputSchema:
      | InteropZodType<RunOutput>
      | SerializableSchema<RunOutput>
      | Record<string, any>,
    config?: StructuredOutputMethodOptions<boolean>
  ):
    | Runnable<BaseLanguageModelInput, RunOutput>
    | Runnable<
        BaseLanguageModelInput,
        { raw: BaseMessage; parsed: RunOutput }
      > {
    if (!this.promptJsonFallback) {
      return super.withStructuredOutput(outputSchema, config as any);
    }

    const instruction = new SystemMessage(
      jsonOnlyInstruction(jsonSchemaOf(outputSchema, config?.name ?? 'output'))
    );

    return RunnableLambda.from(
      async (input: BaseLanguageModelInput, runConfig) => {
        const messages =
          ChatOpenAI._convertInputToPromptValue(input).toChatMessages();
        const raw = await this.invoke([...messages, instruction], runConfig);
        const parsed = parseStructuredText<RunOutput>(
          messageText(raw.content),
          outputSchema as any
        );
        return config?.includeRaw ? { raw, parsed } : parsed;
      }
    ) as any;
  }
}
