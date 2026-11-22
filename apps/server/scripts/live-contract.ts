// One real call per AI operation through the production code (OCT-438): the provider accepts our
// schemas and the answer passes our zod schemas. CI: .github/workflows/live-contract.yml.
import { readFile } from 'node:fs/promises';
import { APICallError } from 'ai';
import type { Recipe } from '@oct/shared';
import { failureNote } from '../src/ai/common.js';
import { normInterview } from '../src/ai/interview.js';
import { lighterRecipe } from '../src/ai/lighter.js';
import { TEST_PHOTOS_DIR } from '../src/ai/model-test/compare.js';
import { parseRecipe } from '../src/ai/parse.js';
import { readLabel, recognizeMeal } from '../src/ai/recognize.js';
import { refineMeal } from '../src/ai/refine.js';
import { fail, modelFromEnv } from './model-from-env.js';

const { model } = await modelFromEnv('live-contract');
const jpeg = await readFile(new URL('banana.jpg', TEST_PHOTOS_DIR));
const n = { proteinG: 1, fatG: 0, carbsG: 20 };
const recipe: Recipe = {
  id: 1,
  name: 'Pancakes',
  cookedG: null,
  servings: 4,
  note: null,
  photoId: null,
  ingredients: [
    { name: 'Flour', grams: 200, kcal: 728, ...n, unit: 'g', source: 'manual' },
    { name: 'Butter', grams: 50, kcal: 359, ...n, unit: 'g', source: 'manual' },
  ],
  steps: [],
  per100: null,
  servingG: null,
  lastLoggedAt: null,
  updatedAt: '2026-11-22T00:00:00.000Z',
};
const profile = {
  sex: null,
  birthDate: null,
  heightCm: null,
  weightKg: null,
  activity: null,
  goal: null,
  targetWeightKg: null,
  deadline: null,
};

const calls: [string, () => Promise<unknown>][] = [
  ['recognize', () => recognizeMeal(model, jpeg, 'en')],
  ['label', () => readLabel(model, jpeg, 'en', '4601234567893')],
  [
    'refine',
    () =>
      refineMeal(model, {
        mode: 'refine',
        jpeg,
        dishes: [
          {
            id: 'd1',
            name: 'Banana',
            grams: 120,
            kcal: 107,
            ...n,
            unit: 'g',
            fixed: [],
          },
        ],
        text: 'it is two bananas',
        locale: 'en',
      }),
  ],
  [
    'parse',
    () =>
      parseRecipe(model, 'Pancakes: 200 g flour, 2 eggs, 300 ml milk.', 'en'),
  ],
  ['lighter', () => lighterRecipe(model, recipe, 'en')],
  [
    'interview',
    () =>
      normInterview(
        model,
        {
          history: [
            { role: 'assistant', kind: 'opening', known: profile },
            { role: 'user', kind: 'text', text: 'male, 34, 180 cm, 85 kg' },
          ],
          draft: { profile, unknown: [], paceWarned: null },
          today: '2026-11-22',
          units: 'metric',
        },
        'en',
      ),
  ],
];

// One retry on 429/5xx: a busy provider is not a contract break.
const retryable = (err: unknown) => {
  const cause = (err as { cause?: unknown }).cause;
  return (
    APICallError.isInstance(cause) &&
    (cause.statusCode === 429 || (cause.statusCode ?? 0) >= 500)
  );
};

const rows = [];
for (const [op, call] of calls) {
  const started = Date.now();
  let result = 'ok';
  for (let attempt = 1; ; attempt++) {
    try {
      await call();
      break;
    } catch (err) {
      if (attempt === 1 && retryable(err)) continue;
      const e = err as { code?: string; cause?: unknown };
      result = `fail ${e.code ?? ''}${failureNote(e.cause ?? err)}`;
      break;
    }
  }
  rows.push({ op, result });
  console.log(`live-contract ${op} ms=${Date.now() - started} ${result}`);
}

const failed = rows.filter((r) => r.result !== 'ok');
if (failed.length)
  fail(
    'live-contract',
    `${failed.length}/${rows.length} calls failed: ${failed.map((r) => r.op).join(', ')}`,
  );
