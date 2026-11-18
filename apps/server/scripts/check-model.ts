// Runs the test photos through recognizeMeal with the provider from env (ADR-0007, ADR-0019). Manual, not in CI.
import { readFile } from 'node:fs/promises';
import { createModel, type AiModel } from '../src/ai/model.js';
import {
  checkPhoto,
  expectedText,
  readExpected,
  TEST_PHOTOS_DIR,
} from '../src/ai/model-test/compare.js';
import {
  reportMarkdown,
  type ModelTestRun,
} from '../src/ai/model-test/format.js';
import {
  recognizeMeal,
  RECOGNIZE_PROMPT_VERSION,
} from '../src/ai/recognize.js';
import { getAiSettings } from '../src/ai/settings.js';
import { loadConfig } from '../src/config.js';
import { appVersion } from '../src/version.js';

const setupHint =
  'Set AI_PROVIDER, AI_MODEL and AI_API_KEY (and AI_BASE_URL for openai-compatible), e.g.\n' +
  '  AI_PROVIDER=google AI_MODEL=gemini-3.8-flash AI_API_KEY=... pnpm --filter @oct/server check-model';

function fail(message: string): never {
  console.error(`check-model: ${message}\n${setupHint}`);
  process.exit(1);
}

const settings = getAiSettings(loadConfig(process.env));
let model: AiModel | null;
try {
  model = await createModel(settings);
} catch (err) {
  fail(`cannot create the model: ${(err as Error).message}`);
}
if (!model || !settings) fail('no AI provider configured.');

const run: ModelTestRun = {
  // The settings id, never the base URL.
  provider: settings.provider,
  model: model.modelId,
  appVersion,
  promptVersion: RECOGNIZE_PROMPT_VERSION,
  startedAt: Date.now(),
  photos: [],
};
const tokens = { inputTokens: 0, outputTokens: 0 };
let errors = 0;
for (const exp of await readExpected()) {
  const jpeg = await readFile(new URL(exp.file, TEST_PHOTOS_DIR));
  const started = Date.now();
  let row;
  try {
    const got = await recognizeMeal(model, jpeg, 'en', undefined, (u) => {
      tokens.inputTokens += u.inputTokens;
      tokens.outputTokens += u.outputTokens;
    });
    row = checkPhoto(exp, got);
  } catch (err) {
    errors++;
    row = { result: `error ${(err as { code?: string }).code ?? err}` };
  }
  run.photos.push({
    file: exp.file,
    expected: expectedText(exp),
    ...row,
    ms: Date.now() - started,
  });
}

console.table(run.photos);
console.log(`\n${reportMarkdown({ ...run, ...tokens })}`);
if (errors === run.photos.length)
  fail('every photo failed; check the model name, key and base URL.');
