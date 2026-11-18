import { APICallError } from 'ai';
import type { AiModelInfo, AiProviderId } from '@oct/shared';

export const MODELS_TIMEOUT_MS = 15_000;

// Endpoints the SDK packages use by default.
const DEFAULT_BASE: Record<AiProviderId, string | undefined> = {
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  'openai-compatible': undefined,
};
// OpenAI does not report capabilities: models that cannot chat are hidden by name (ADR-0018 §4).
const OPENAI_HIDDEN =
  /embedding|tts|whisper|dall-e|gpt-image|moderation|transcribe|realtime/i;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Per token → per 1M tokens; a missing, non-numeric or negative price (routers send -1) is no price.
const perMTok = (raw: unknown) => {
  const n = typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Number((n * 1e6).toFixed(6)) : null;
};

/**
 * The provider's chat models (ADR-0018 §4), with photo support first, then by name. Throws
 * APICallError without the response body on a non-2xx answer, TimeoutError after 15 s.
 */
export async function listModels({
  provider,
  baseUrl,
  apiKey,
}: {
  provider: AiProviderId;
  baseUrl?: string;
  apiKey?: string;
}): Promise<AiModelInfo[]> {
  const base = (baseUrl ?? DEFAULT_BASE[provider])!.replace(/\/+$/, '');
  // One deadline for the whole call, Google's pages included.
  const signal = AbortSignal.timeout(MODELS_TIMEOUT_MS);
  const get = async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers, signal });
    if (!res.ok)
      // The body may echo the request; only the status leaves the server.
      throw new APICallError({
        message: `HTTP ${res.status}`,
        url,
        requestBodyValues: {},
        statusCode: res.status,
      });
    return (await res.json()) as Json;
  };
  const bearer: Record<string, string> = apiKey
    ? { Authorization: `Bearer ${apiKey}` }
    : {};

  let models: AiModelInfo[];
  switch (provider) {
    case 'google': {
      const raw: Json[] = [];
      let page = '';
      do {
        const body = await get(
          `${base}/models?pageSize=1000${page && `&pageToken=${encodeURIComponent(page)}`}`,
          { 'x-goog-api-key': apiKey ?? '' },
        );
        raw.push(...(body.models ?? []));
        page = body.nextPageToken ?? '';
      } while (page);
      models = raw
        .filter((m) =>
          m.supportedGenerationMethods?.includes('generateContent'),
        )
        .map((m) => {
          const id = String(m.name).replace(/^models\//, '');
          return {
            id,
            name: m.displayName || undefined,
            vision: id.startsWith('gemini-') ? true : null,
          };
        });
      break;
    }
    case 'openai':
      models = ((await get(`${base}/models`, bearer)).data as Json[])
        .filter((m) => !OPENAI_HIDDEN.test(m.id))
        .map((m) => ({ id: m.id, vision: null }));
      break;
    case 'anthropic':
      models = (
        (
          await get(`${base}/models?limit=1000`, {
            'x-api-key': apiKey ?? '',
            'anthropic-version': '2023-06-01',
          })
        ).data as Json[]
      ).map((m) => ({
        id: m.id,
        name: m.display_name || undefined,
        vision: null,
      }));
      break;
    case 'openrouter':
      models = ((await get(`${base}/models`, bearer)).data as Json[])
        .filter((m) => {
          const out = m.architecture?.output_modalities;
          return !out || (out.length === 1 && out[0] === 'text');
        })
        .map((m) => {
          const input = perMTok(m.pricing?.prompt);
          const output = perMTok(m.pricing?.completion);
          return {
            id: m.id,
            name: m.name || undefined,
            vision: !!m.architecture?.input_modalities?.includes('image'),
            ...(input !== null &&
              output !== null && {
                price: { inputPerMTok: input, outputPerMTok: output },
              }),
          };
        });
      break;
    case 'openai-compatible':
      models = ((await get(`${base}/models`, bearer)).data as Json[]).map(
        (m) => ({ id: m.id, vision: null }),
      );
      break;
  }
  const rank = (m: AiModelInfo) => (m.vision ? 0 : 1);
  return models.sort(
    (a, b) =>
      rank(a) - rank(b) || (a.name ?? a.id).localeCompare(b.name ?? b.id),
  );
}
