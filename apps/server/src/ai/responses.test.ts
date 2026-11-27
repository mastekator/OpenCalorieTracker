import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.js';
import { testApp } from '../test/app.js';
import { createModel } from './model.js';
import { recognizeMeal } from './recognize.js';
import { getAiSettings } from './settings.js';
import { providerState, setActiveModel } from './status.js';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
const egg = {
  name: 'Egg',
  grams: 50,
  kcal: 78,
  proteinG: 6.3,
  fatG: 5.3,
  carbsG: 0.6,
  confidence: 0.96,
  unit: 'g',
};

const sse = (events: object[]) =>
  new Response(
    events
      .map(
        (e) =>
          `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`,
      )
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );

// A Responses API stream in the documented event shape, the answer split over two deltas.
const answer = JSON.stringify({ dishes: [egg], questions: [] });
const response = {
  id: 'resp_1',
  object: 'response',
  created_at: 1764230400,
  model: 'gpt-5.4',
  status: 'in_progress',
  output: [],
  usage: null,
};
const usage = {
  input_tokens: 812,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 64,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 876,
};
const message = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  status: 'in_progress',
  content: [],
};
const recorded = [
  { type: 'response.created', sequence_number: 0, response },
  { type: 'response.in_progress', sequence_number: 1, response },
  {
    type: 'response.output_item.added',
    sequence_number: 2,
    output_index: 0,
    item: message,
  },
  {
    type: 'response.content_part.added',
    sequence_number: 3,
    item_id: 'msg_1',
    output_index: 0,
    content_index: 0,
    part: { type: 'output_text', text: '', annotations: [] },
  },
  ...[answer.slice(0, 20), answer.slice(20)].map((delta, i) => ({
    type: 'response.output_text.delta',
    sequence_number: 4 + i,
    item_id: 'msg_1',
    output_index: 0,
    content_index: 0,
    delta,
    logprobs: [],
  })),
  {
    type: 'response.output_item.done',
    sequence_number: 6,
    output_index: 0,
    item: {
      ...message,
      status: 'completed',
      content: [{ type: 'output_text', text: answer, annotations: [] }],
    },
  },
  {
    type: 'response.completed',
    sequence_number: 7,
    response: { ...response, status: 'completed', usage },
  },
];

const chatgptModel = async (reply: () => Response) => {
  const fetch = vi.fn(async () => reply());
  const accessToken = vi.fn(async () => 'access-1');
  const model = (await createModel(
    getAiSettings(loadConfig({ AI_PROVIDER: 'chatgpt', AI_MODEL: 'gpt-5.4' })),
    fetch as unknown as typeof globalThis.fetch,
    { accessToken },
  ))!;
  setActiveModel(model);
  return { model, fetch };
};

const failed = (status: number, code: string) => () =>
  new Response(
    JSON.stringify({
      error: {
        message: 'no',
        type: 'invalid_request_error',
        code,
        param: null,
      },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );

afterEach(() => {
  vi.restoreAllMocks();
  setActiveModel(null);
});

describe('chatgpt provider (ADR-0031 §4)', () => {
  it('streams the Responses API call and recognizeMeal reads it unchanged', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { model, fetch } = await chatgptModel(() => sse(recorded));
    await expect(recognizeMeal(model, jpeg, 'en')).resolves.toEqual({
      dishes: [egg],
      questions: [],
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer access-1',
    );
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ stream: true, store: false });
    expect(body.instructions).toContain('nutrition');
    expect(body.input.every((m: { role: string }) => m.role === 'user')).toBe(
      true,
    );
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('max_output_tokens');
    expect(providerState(model).state).toBe('ok');
  });

  it('429 subscription_sharing_usage_limit_exceeded is quota_exceeded, sent once', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { model, fetch } = await chatgptModel(
      failed(429, 'subscription_sharing_usage_limit_exceeded'),
    );
    await expect(recognizeMeal(model, jpeg, 'en')).rejects.toMatchObject({
      code: 'ai_quota_exceeded',
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(providerState(model).state).toBe('quota_exceeded');
  });

  it('the same limit inside the stream is quota_exceeded too', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { model, fetch } = await chatgptModel(() =>
      sse([
        recorded[0]!,
        {
          type: 'response.failed',
          sequence_number: 1,
          response: {
            ...response,
            status: 'failed',
            error: {
              code: 'subscription_sharing_usage_limit_exceeded',
              message: 'Usage limit reached',
            },
          },
        },
      ]),
    );
    await expect(recognizeMeal(model, jpeg, 'en')).rejects.toMatchObject({
      code: 'ai_quota_exceeded',
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(providerState(model).state).toBe('quota_exceeded');
  });

  it('a plan without access is auth_error plan_not_allowed', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { model } = await chatgptModel(
      failed(403, 'subscription_sharing_user_not_eligible'),
    );
    await expect(recognizeMeal(model, jpeg, 'en')).rejects.toBeDefined();
    expect(providerState(model)).toMatchObject({
      state: 'auth_error',
      details: { status: 403, reason: 'plan_not_allowed' },
    });
  });

  it('has no model without the sign-in', async () => {
    expect(
      await createModel(
        getAiSettings(
          loadConfig({ AI_PROVIDER: 'chatgpt', AI_MODEL: 'gpt-5.4' }),
        ),
      ),
    ).toBeNull();
  });

  it('serves only the admin: others get manual mode (AC-B1.8)', () => {
    const { ai } = testApp(
      { AI_PROVIDER: 'chatgpt', AI_MODEL: 'gpt-5.4' },
      new MockLanguageModelV4({ modelId: 'gpt-5.4' }),
    );
    expect(ai.forUser({ id: 1, role: 'admin' })?.source).toBe('server');
    expect(ai.forUser({ id: 2, role: 'user' })).toBeNull();
    expect(ai.forUser({ id: 2 })).toBeNull();
  });
});
