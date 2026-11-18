// Runs the test photos through recognizeMeal with the provider from env (ADR-0007, ADR-0019). Manual, not in CI.
import {
  reportMarkdown,
  type ModelTestRun,
} from '../src/ai/model-test/format.js';
import { pendingPhotos, testPhotos } from '../src/ai/model-test/runner.js';
import { RECOGNIZE_PROMPT_VERSION } from '../src/ai/recognize.js';
import { appVersion } from '../src/version.js';
import { fail, modelFromEnv } from './model-from-env.js';

const { model, settings } = await modelFromEnv('check-model');

const run: ModelTestRun = {
  // The settings id, never the base URL.
  provider: settings.provider,
  model: model.modelId,
  appVersion,
  promptVersion: RECOGNIZE_PROMPT_VERSION,
  startedAt: Date.now(),
  photos: await pendingPhotos(),
};
const tokens = { inputTokens: 0, outputTokens: 0 };
const stopped = await testPhotos(model, run.photos, {
  apiKey: settings.apiKey,
  onUsage: (u) => {
    tokens.inputTokens += u.inputTokens;
    tokens.outputTokens += u.outputTokens;
  },
});
for (const p of run.photos) if (p.result === 'pending') p.result = 'not_run';

console.table(run.photos);
console.log(`\n${reportMarkdown({ ...run, ...tokens })}`);
if (stopped || run.photos.every((p) => p.result.startsWith('error')))
  fail(
    'check-model',
    `${stopped ? `stopped early (${stopped})` : 'every photo failed'}; check the model name, key and base URL.`,
  );
