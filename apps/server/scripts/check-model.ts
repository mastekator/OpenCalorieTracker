// Runs the test photos through recognizeMeal with the provider from env (ADR-0007). Manual, not in CI.
import { readFile } from 'node:fs/promises';
import { confidenceLevel } from '@oct/shared';
import { createModel, type AiModel } from '../src/ai/model.js';
import { recognizeMeal } from '../src/ai/recognize.js';
import { getAiSettings } from '../src/ai/settings.js';
import { loadConfig } from '../src/config.js';
import { compare, totalKcal, type Expected } from './compare.js';

const dir = new URL('../test-photos/', import.meta.url);
const setupHint =
  'Set AI_PROVIDER, AI_MODEL and AI_API_KEY (and AI_BASE_URL for openai-compatible), e.g.\n' +
  '  AI_PROVIDER=google AI_MODEL=gemini-2.5-flash AI_API_KEY=... pnpm --filter @oct/server check-model';

function fail(message: string): never {
  console.error(`check-model: ${message}\n${setupHint}`);
  process.exit(1);
}

let model: AiModel | null;
try {
  model = await createModel(getAiSettings(loadConfig(process.env)));
} catch (err) {
  fail(`cannot create the model: ${(err as Error).message}`);
}
if (!model) fail('no AI provider configured.');

const expected: Expected[] = JSON.parse(
  await readFile(new URL('expected.json', dir), 'utf8'),
);
const rows = [];
let passed = 0;
let errors = 0;
for (const exp of expected) {
  const jpeg = await readFile(new URL(exp.file, dir));
  const started = Date.now();
  let row;
  try {
    const got = await recognizeMeal(model, jpeg, 'en');
    const miss = compare(exp, got);
    if (!miss) passed++;
    row = {
      got: got.dishes.map((d) => d.name).join(', ') || '(none)',
      kcal: totalKcal(got),
      levels: got.dishes.map((d) => confidenceLevel(d.confidence)).join(','),
      result: miss ?? 'ok',
    };
  } catch (err) {
    errors++;
    row = { result: `error ${(err as { code?: string }).code ?? err}` };
  }
  rows.push({
    file: exp.file,
    expected:
      'empty' in exp
        ? '(none)'
        : `${exp.dishes.join(', ')}; ${exp.kcal.join('-')} kcal; ${exp.level}`,
    ...row,
    ms: Date.now() - started,
  });
}

console.table(rows);
console.log(
  `${model.provider} ${model.modelId}: ${passed}/${expected.length} passed`,
);
if (errors === expected.length)
  fail('every photo failed; check the model name, key and base URL.');
