import { readFile } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import {
  toIngredient,
  type AiTestPhoto,
  type AiTestStopReason,
} from '@oct/shared';
import { readBarcodes } from '../../barcodes/read.js';
import { ApiError } from '../../http/errors.js';
import { appVersion } from '../../version.js';
import type { AiModel } from '../model.js';
import { listModels } from '../models.js';
import { applyEdible } from '../edible.js';
import { applyIngredientEdible, recognizeIngredients } from '../ingredients.js';
import { recognizeMeal, RECOGNIZE_PROMPT_VERSION } from '../recognize.js';
import type { AiSettings } from '../settings.js';
import { aiResultOf, redactSecrets } from '../status.js';
import {
  checkIngredients,
  checkPhoto,
  expectedText,
  type ExpectedIngredients,
  readExpected,
  TEST_PHOTOS_DIR,
} from './compare.js';

const KEEP_RUNS = 20;
const HOUR_MS = 60 * 60 * 1000;
const RUNS_PER_HOUR = 10;
// Every next photo fails the same way: stop early (ADR-0019 §3, AC-2.8).
const FATAL = ['auth_error', 'model_not_found', 'quota_exceeded'] as const;

/**
 * A raw-products photo like `?mode=ingredients` (ADR-0040 §7): barcodes read, the weight picked
 * and the edible part applied as in the app, but no product lookup: it tests the model, not the network.
 */
async function testIngredients(
  model: AiModel,
  exp: ExpectedIngredients,
  jpeg: Uint8Array,
  opts: Parameters<typeof recognizeIngredients>[4],
) {
  const codes = await readBarcodes(jpeg).catch(() => []);
  const rows = (
    await recognizeIngredients(model, jpeg, 'en', codes, opts)
  ).flatMap((row) => {
    const item = toIngredient(row, null);
    return item ? [{ row, item }] : [];
  });
  const items = applyIngredientEdible(rows, () => new Map());
  return checkIngredients(
    exp,
    items.map((item, i) => {
      const { barcode, printedBarcode } = rows[i]!.row;
      return {
        ...item,
        codes: [barcode, printedBarcode].filter((c) => c !== null),
      };
    }),
  );
}

/** The test set version and its photos, none run yet. */
export async function pendingPhotos() {
  const { set, photos } = await readExpected();
  return {
    set,
    photos: photos.map((e): AiTestPhoto => ({
      file: e.file,
      expected: expectedText(e),
      result: 'pending',
    })),
  };
}

/**
 * Runs `photos` one by one in English (ADR-0019), filling each in place; shared by check-model
 * and the admin test. Ends early on abort or a fatal provider error, returned as the reason;
 * the photos not reached stay 'pending'.
 */
export async function testPhotos(
  model: AiModel,
  photos: AiTestPhoto[],
  opts: {
    apiKey?: string;
    signal?: AbortSignal;
    onUsage?: (u: { inputTokens: number; outputTokens: number }) => void;
    onPhoto?: () => void;
  } = {},
): Promise<AiTestStopReason | undefined> {
  const expected = (await readExpected()).photos;
  for (const [i, photo] of photos.entries()) {
    if (opts.signal?.aborted) return 'user';
    const exp = expected.find((e) => e.file === photo.file)!;
    const jpeg = await readFile(new URL(exp.file, TEST_PHOTOS_DIR));
    const started = Date.now();
    let fatal: AiTestStopReason | undefined;
    try {
      if ('mode' in exp) {
        photos[i] = {
          ...photo,
          ...(await testIngredients(model, exp, jpeg, {
            signal: opts.signal,
            onUsage: opts.onUsage,
          })),
        };
      } else {
        // Scored on edible grams like the app shows them; never the user's own shares (ADR-0039 §6).
        const got = applyEdible(
          await recognizeMeal(model, jpeg, 'en', opts.signal, opts.onUsage),
          () => new Map(),
          'en',
        );
        photos[i] = {
          ...photo,
          ...checkPhoto(exp, got),
          questions: got.questions.length,
        };
      }
    } catch (err) {
      if (opts.signal?.aborted) return 'user';
      let result: string;
      if (err instanceof ApiError) {
        result = err.code;
        const { state } = aiResultOf(err.cause);
        fatal = FATAL.find((s) => s === state);
      } else
        result = redactSecrets(String((err as Error)?.message), opts.apiKey);
      photos[i] = { ...photo, result: `error ${result}` };
    }
    photos[i]!.ms = Date.now() - started;
    opts.onPhoto?.();
    if (fatal) return fatal;
  }
  return undefined;
}

/** USD per 1M tokens of an OpenRouter model, or null when the list does not say. */
async function priceOf(settings: AiSettings) {
  if (settings.provider !== 'openrouter') return null;
  try {
    const models = await listModels(settings);
    return models.find((m) => m.id === settings.model)?.price ?? null;
  } catch {
    return null;
  }
}

/**
 * The background model test (ADR-0019 §3): one run at a time, 10 starts an hour, rows in
 * ai_test_runs. A run left `running` by a restart becomes `interrupted` here (E-9).
 */
export function createModelTestRunner(db: Database) {
  db.prepare(
    "UPDATE ai_test_runs SET status = 'interrupted' WHERE status = 'running'",
  ).run();
  let current: { id: number; abort: AbortController } | null = null;
  // shortcut: in memory, a restart resets the hourly limit; ADR-0019 accepts it.
  let starts: number[] = [];

  return {
    runningId: () => current?.id ?? null,

    stop(id: number) {
      if (current?.id === id) current.abort.abort();
    },

    /** Throws 409 ai_test_running or 429 too_many_attempts; returns the new run id at once. */
    async start(settings: AiSettings, model: AiModel) {
      // The only await, before the checks: from them to `current = ...` nothing yields, so two starts can't race.
      const { set, photos } = await pendingPhotos();
      // Before the limit: a refused start spends no attempt.
      if (current)
        throw new ApiError(409, 'ai_test_running', { id: current.id });
      const now = Date.now();
      starts = starts.filter((t) => t > now - HOUR_MS);
      if (starts.length >= RUNS_PER_HOUR)
        throw new ApiError(429, 'too_many_attempts', {
          retryAfterSec: Math.ceil((starts[0]! + HOUR_MS - now) / 1000),
        });
      starts.push(now);

      const id = Number(
        db
          .prepare(
            `INSERT INTO ai_test_runs (provider, model, status, app_version, prompt_version, test_set, started_at, photos)
             VALUES (?, ?, 'running', ?, ?, ?, ?, ?)`,
          )
          .run(
            settings.provider,
            settings.model,
            appVersion,
            RECOGNIZE_PROMPT_VERSION,
            set,
            now,
            JSON.stringify(photos),
          ).lastInsertRowid,
      );
      db.prepare(
        'DELETE FROM ai_test_runs WHERE id NOT IN (SELECT id FROM ai_test_runs ORDER BY id DESC LIMIT ?)',
      ).run(KEEP_RUNS);
      const abort = new AbortController();
      current = { id, abort };

      const tokens = { inputTokens: 0, outputTokens: 0 };
      let price: Awaited<ReturnType<typeof priceOf>> = null;
      const save = (extra = '', params: Record<string, unknown> = {}) =>
        db
          .prepare(
            `UPDATE ai_test_runs SET photos = @photos, input_tokens = @in, output_tokens = @out,
             cost_usd = @cost${extra} WHERE id = @id`,
          )
          .run({
            id,
            photos: JSON.stringify(photos),
            in: tokens.inputTokens,
            out: tokens.outputTokens,
            cost:
              price &&
              (tokens.inputTokens * price.inputPerMTok +
                tokens.outputTokens * price.outputPerMTok) /
                1e6,
            ...params,
          });

      void (async () => {
        let reason: AiTestStopReason | undefined | null = null;
        try {
          price = await priceOf(settings);
          reason = await testPhotos(model, photos, {
            apiKey: settings.apiKey,
            signal: abort.signal,
            onUsage: (u) => {
              tokens.inputTokens += u.inputTokens;
              tokens.outputTokens += u.outputTokens;
            },
            onPhoto: () => save(),
          });
        } catch (err) {
          console.error(`[error] model test ${id}:`, err);
        } finally {
          for (const p of photos)
            if (p.result === 'pending') p.result = 'not_run';
          save(
            ', status = @status, stop_reason = @reason, finished_at = @now',
            {
              status: reason === undefined ? 'done' : 'stopped',
              reason: reason ?? null,
              now: Date.now(),
            },
          );
          current = null;
        }
      })();
      return id;
    },
  };
}
