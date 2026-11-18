import { APICallError } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listModels } from './models.js';

// Trimmed samples of the real list responses.
const SAMPLES = {
  google: [
    {
      models: [
        {
          name: 'models/text-embedding-004',
          displayName: 'Text Embedding 004',
          supportedGenerationMethods: ['embedContent'],
        },
        {
          name: 'models/gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
          supportedGenerationMethods: ['generateContent', 'countTokens'],
        },
      ],
      nextPageToken: 'p 2',
    },
    {
      models: [
        {
          name: 'models/gemma-3-27b-it',
          displayName: 'Gemma 3 27B',
          supportedGenerationMethods: ['generateContent'],
        },
      ],
    },
  ],
  openai: {
    object: 'list',
    data: [
      'gpt-4o',
      'text-embedding-3-small',
      'tts-1',
      'whisper-1',
      'dall-e-3',
      'gpt-image-1',
      'omni-moderation-latest',
      'gpt-4o-transcribe',
      'gpt-4o-realtime-preview',
      'gpt-4.1-mini',
    ].map((id) => ({ id, object: 'model', owned_by: 'openai' })),
  },
  anthropic: {
    data: [
      {
        type: 'model',
        id: 'claude-sonnet-4-5',
        display_name: 'Claude Sonnet 4.5',
      },
    ],
    has_more: false,
  },
  openrouter: {
    data: [
      {
        id: 'openai/gpt-4o',
        name: 'OpenAI: GPT-4o',
        architecture: {
          input_modalities: ['text', 'image', 'file'],
          output_modalities: ['text'],
        },
        pricing: { prompt: '0.0000025', completion: '0.00001' },
      },
      {
        id: 'meta/llama-free',
        name: 'Llama (free)',
        architecture: {
          input_modalities: ['text'],
          output_modalities: ['text'],
        },
        pricing: { prompt: '0', completion: '0' },
      },
      {
        id: 'openrouter/auto',
        name: 'Auto Router',
        architecture: {
          input_modalities: ['text', 'image'],
          output_modalities: ['text'],
        },
        pricing: { prompt: '-1', completion: '-1' },
      },
      {
        id: 'google/gemini-image',
        name: 'Gemini Image',
        architecture: {
          input_modalities: ['text', 'image'],
          output_modalities: ['image', 'text'],
        },
        pricing: { prompt: '0.0000003', completion: '0.0000025' },
      },
    ],
  },
};

const fetchMock = (...bodies: unknown[]) => {
  const fn = vi.fn<typeof fetch>(async () => Response.json(bodies.shift()));
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listModels', () => {
  it('google: joins pages, keeps generateContent models, gemini-* sees photos', async () => {
    const fn = fetchMock(...SAMPLES.google);
    const models = await listModels({ provider: 'google', apiKey: 'k' });
    expect(models).toEqual([
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', vision: true },
      { id: 'gemma-3-27b-it', name: 'Gemma 3 27B', vision: null },
    ]);
    expect(fn.mock.calls.map((c) => c[0])).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=p%202',
    ]);
    expect(fn.mock.calls[0]![1]!.headers).toEqual({ 'x-goog-api-key': 'k' });
    // One deadline for every page.
    expect(fn.mock.calls[0]![1]!.signal).toBe(fn.mock.calls[1]![1]!.signal);
  });

  it('openai: hides models that cannot chat', async () => {
    const fn = fetchMock(SAMPLES.openai);
    expect(await listModels({ provider: 'openai', apiKey: 'k' })).toEqual([
      { id: 'gpt-4.1-mini', vision: null },
      { id: 'gpt-4o', vision: null },
    ]);
    expect(fn).toHaveBeenCalledWith('https://api.openai.com/v1/models', {
      headers: { Authorization: 'Bearer k' },
      signal: expect.any(AbortSignal),
    });
  });

  it('anthropic: name from display_name', async () => {
    const fn = fetchMock(SAMPLES.anthropic);
    expect(await listModels({ provider: 'anthropic', apiKey: 'k' })).toEqual([
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', vision: null },
    ]);
    expect(fn.mock.calls[0]![0]).toBe(
      'https://api.anthropic.com/v1/models?limit=1000',
    );
    expect(fn.mock.calls[0]![1]!.headers).toEqual({
      'x-api-key': 'k',
      'anthropic-version': '2023-06-01',
    });
  });

  it('openrouter: vision from input_modalities, price per 1M, text output only', async () => {
    fetchMock(SAMPLES.openrouter);
    expect(await listModels({ provider: 'openrouter', apiKey: 'k' })).toEqual([
      { id: 'openrouter/auto', name: 'Auto Router', vision: true },
      {
        id: 'openai/gpt-4o',
        name: 'OpenAI: GPT-4o',
        vision: true,
        price: { inputPerMTok: 2.5, outputPerMTok: 10 },
      },
      {
        id: 'meta/llama-free',
        name: 'Llama (free)',
        vision: false,
        price: { inputPerMTok: 0, outputPerMTok: 0 },
      },
    ]);
  });

  it('openai-compatible: {baseUrl}/models, no Authorization without a key', async () => {
    const fn = fetchMock({ data: [{ id: 'qwen2.5vl' }, { id: 'llava' }] });
    expect(
      await listModels({
        provider: 'openai-compatible',
        baseUrl: 'http://llm.local:11434/v1/',
      }),
    ).toEqual([
      { id: 'llava', vision: null },
      { id: 'qwen2.5vl', vision: null },
    ]);
    expect(fn).toHaveBeenCalledWith('http://llm.local:11434/v1/models', {
      headers: {},
      signal: expect.any(AbortSignal),
    });
  });

  it('throws the status only, never the response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad key sk-123 echoed', { status: 401 })),
    );
    const err = await listModels({
      provider: 'openai',
      apiKey: 'sk-123',
    }).catch((e: unknown) => e);
    expect(APICallError.isInstance(err)).toBe(true);
    expect(err).toMatchObject({ statusCode: 401, message: 'HTTP 401' });
    expect((err as APICallError).responseBody).toBeUndefined();
  });
});
