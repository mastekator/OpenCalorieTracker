import { APICallError, type LanguageModelMiddleware } from 'ai';

/** Responses API with a ChatGPT sign-in token (ADR-0031 §4). */
export const CHATGPT_BASE_URL = 'https://api.openai.com/v1';

const USAGE_LIMIT = 'subscription_sharing_usage_limit_exceeded';
/** The account's plan or workspace does not allow apps to use it (E-3). */
const NOT_ELIGIBLE = 'subscription_sharing_user_not_eligible';

/** error.code of a failed call: the HTTP error body or a response.failed stream event. */
function errorCode(err: unknown) {
  const data = (err as { data?: unknown } | null)?.data as
    | { error?: { code?: unknown }; response?: { error?: { code?: unknown } } }
    | undefined;
  const code = data?.error?.code ?? data?.response?.error?.code;
  return typeof code === 'string' ? code : undefined;
}

export const isPlanNotAllowed = (err: unknown) =>
  errorCode(err) === NOT_ELIGIBLE;

/**
 * A subscription error with its documented status, whatever status the stream gave it, so the usual
 * mapping makes 429 quota_exceeded and 403 auth_error. Other errors stay as they are.
 */
function withStatus(err: unknown) {
  const code = errorCode(err);
  const statusCode =
    code === USAGE_LIMIT ? 429 : code === NOT_ELIGIBLE ? 403 : undefined;
  if (
    !statusCode ||
    (APICallError.isInstance(err) && err.statusCode === statusCode)
  )
    return err;
  return new APICallError({
    message: (err as Error).message,
    url: `${CHATGPT_BASE_URL}/responses`,
    requestBodyValues: {},
    statusCode,
    data: (err as { data?: unknown }).data,
    isRetryable: false,
  });
}

type Warnings = Awaited<
  ReturnType<NonNullable<LanguageModelMiddleware['wrapGenerate']>>
>['warnings'];

/**
 * What the ChatGPT sign-in requires of every call (OpenAI preview limits): no system messages (they
 * go to instructions), store false, streaming only, no sampling or length options. generateText
 * callers stay as they are: the stream is collected into one result.
 */
export const chatgptMiddleware: LanguageModelMiddleware = {
  transformParams: async ({ params }) => {
    const system = params.prompt
      .flatMap((m) => (m.role === 'system' ? [m.content] : []))
      .join('\n\n');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { temperature, topP, maxOutputTokens, ...rest } = params;
    return {
      ...rest,
      prompt: params.prompt.filter((m) => m.role !== 'system'),
      providerOptions: {
        ...params.providerOptions,
        openai: {
          ...params.providerOptions?.openai,
          store: false,
          ...(system && { instructions: system }),
        },
      },
    };
  },
  wrapGenerate: async ({ doStream }) => {
    const { stream, request, response } = await doStream().then(
      (r) => r,
      (err: unknown) => {
        throw withStatus(err);
      },
    );
    let text = '';
    let meta: { id?: string; timestamp?: Date; modelId?: string } = {};
    let warnings: Warnings = [];
    for await (const part of stream) {
      if (part.type === 'text-delta') text += part.delta;
      else if (part.type === 'error') throw withStatus(part.error);
      else if (part.type === 'stream-start') warnings = part.warnings;
      else if (part.type === 'response-metadata')
        meta = {
          id: part.id,
          timestamp: part.timestamp,
          modelId: part.modelId,
        };
      else if (part.type === 'finish') {
        return {
          content: [{ type: 'text', text }],
          finishReason: part.finishReason,
          usage: part.usage,
          providerMetadata: part.providerMetadata,
          warnings,
          request,
          response: { ...meta, headers: response?.headers },
        };
      }
    }
    throw new APICallError({
      message: 'The ChatGPT stream ended before it finished',
      url: `${CHATGPT_BASE_URL}/responses`,
      requestBodyValues: {},
      isRetryable: false,
    });
  },
};
