// Runs the refine prompt cases through refineMeal with the provider from env (ADR-0020 §10). Manual, not in CI.
import { readFile } from 'node:fs/promises';
import { TEST_PHOTOS_DIR } from '../src/ai/model-test/compare.js';
import {
  checkRefined,
  expectedCaseText,
  readCases,
} from '../src/ai/model-test/refine-cases.js';
import { refineMeal, REFINE_PROMPT_VERSION } from '../src/ai/refine.js';
import { fail, modelFromEnv } from './model-from-env.js';

const { model, settings } = await modelFromEnv('check-refine');

const rows = [];
let errors = 0;
for (const c of await readCases()) {
  const jpeg = c.photo
    ? await readFile(new URL(c.photo, TEST_PHOTOS_DIR))
    : undefined;
  const started = Date.now();
  let row;
  try {
    row = checkRefined(c, await refineMeal(model, { ...c, jpeg }));
  } catch (err) {
    errors++;
    row = { result: `error ${(err as { code?: string }).code ?? err}` };
  }
  rows.push({
    case: c.name,
    expected: expectedCaseText(c),
    ...row,
    ms: Date.now() - started,
  });
}

console.table(rows);
const ok = rows.filter((r) => r.result === 'ok').length;
console.log(
  `\n${ok}/${rows.length} ok · ${settings.provider} ${model.modelId} · refine prompt v${REFINE_PROMPT_VERSION}`,
);
if (errors === rows.length)
  fail(
    'check-refine',
    'every case failed; check the model name, key and base URL.',
  );
