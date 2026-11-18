// The provider from env for the manual model scripts (check-model, check-refine). Not in CI.
import { createModel, type AiModel } from '../src/ai/model.js';
import { getAiSettings, type AiSettings } from '../src/ai/settings.js';
import { loadConfig } from '../src/config.js';

export function fail(script: string, message: string): never {
  console.error(
    `${script}: ${message}\n` +
      'Set AI_PROVIDER, AI_MODEL and AI_API_KEY (and AI_BASE_URL for openai-compatible), e.g.\n' +
      `  AI_PROVIDER=google AI_MODEL=gemini-3.8-flash AI_API_KEY=... pnpm --filter @oct/server ${script}`,
  );
  process.exit(1);
}

export async function modelFromEnv(
  script: string,
): Promise<{ model: AiModel; settings: AiSettings }> {
  const settings = getAiSettings(loadConfig(process.env));
  let model: AiModel | null;
  try {
    model = await createModel(settings);
  } catch (err) {
    fail(script, `cannot create the model: ${(err as Error).message}`);
  }
  if (!model || !settings) fail(script, 'no AI provider configured.');
  return { model, settings };
}
