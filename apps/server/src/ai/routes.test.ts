import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { photoPath } from '../photos/store.js';
import { aiSetup, apiError, mockModel, reply } from '../test/ai.js';

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

let cleanup: (() => Promise<void>) | undefined;
const setup = async (model: Parameters<typeof aiSetup>[0]) => {
  const t = await aiSetup(model);
  cleanup = t.cleanup;
  return t;
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
  cleanup = undefined;
});

/** A model whose first call waits for `release`, then answers with an egg. */
function gatedModel() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const signals: AbortSignal[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async ({ abortSignal }) => {
      signals.push(abortSignal!);
      await gate;
      return reply({ dishes: [egg] });
    },
  });
  return { model, release, signals };
}

describe('GET /api/ai/status', () => {
  it('is not_configured without a model and ready with one', async () => {
    expect(await (await setup(null)).status()).toEqual({
      recognition: 'not_configured',
      interview: 'not_configured',
      providerName: null,
      baseUrlHost: null,
      refineLimit: null,
    });
    await cleanup!();
    expect(await (await setup(mockModel())).status()).toEqual({
      recognition: 'ready',
      interview: 'ready',
      providerName: null,
      baseUrlHost: null,
      refineLimit: null,
    });
  });

  it('needs a session', async () => {
    const t = await setup(null);
    expect((await t.app.request('/api/ai/status')).status).toBe(401);
  });
});

describe('POST /api/photos/:id/recognize', () => {
  it('returns the sanitized recognition', async () => {
    const t = await setup(mockModel({ dishes: [{ ...egg, grams: 50.4 }] }));
    const res = await t.recognize(await t.upload());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dishes: [egg], questions: [] });
  });

  it('is 409 ai_not_configured without a model (AC-6.6)', async () => {
    const t = await setup(null);
    const res = await t.recognize(await t.upload());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'ai_not_configured' } });
  });

  it.each([
    [apiError(429, 'quota text from provider'), 429, 'ai_quota_exceeded'],
    [apiError(500, 'stack trace from provider'), 503, 'ai_unavailable'],
    // The cause the model test reads stays on the server.
    [apiError(401, 'bad key from provider'), 503, 'ai_unavailable'],
    [{ dishes: 'nope' }, 502, 'ai_invalid_response'],
  ])(
    'maps a provider failure to %#: %i %s without its text (AC-6.1, AC-6.2)',
    async (failure, status, code) => {
      const t = await setup(mockModel(failure, failure));
      const res = await t.recognize(await t.upload());
      expect(res.status).toBe(status);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: { code } });
      expect(text).not.toMatch(/provider/);
    },
  );

  it("is 404 for another user's, a missing or a malformed photo", async () => {
    const t = await setup(mockModel({ dishes: [egg] }));
    const id = await t.upload();
    const other = await t.signIn('b@example.com');
    expect((await t.recognize(id, other)).status).toBe(404);
    expect((await t.recognize('A'.repeat(22))).status).toBe(404);
    expect((await t.recognize('bad')).status).toBe(404);
  });

  it('is 410 photo_expired when only the preview is left', async () => {
    const t = await setup(mockModel({ dishes: [egg] }));
    const id = await t.upload();
    const userId = (
      t.db
        .prepare('SELECT id FROM users WHERE email = ?')
        .get('admin@example.com') as { id: number }
    ).id;
    await rm(photoPath(t.dataDir, userId, id, 'full')!);
    const res = await t.recognize(id);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: { code: 'photo_expired' } });
  });

  it('allows one call per user: another photo gets 429, the same photo joins', async () => {
    const { model, release } = gatedModel();
    const t = await setup(model);
    const [a, b] = [await t.upload(), await t.upload()];
    const first = t.recognize(a);
    await vi.waitFor(() => expect(model.doGenerateCalls).toHaveLength(1));

    const busy = await t.recognize(b);
    expect(busy.status).toBe(429);
    expect(await busy.json()).toEqual({
      error: { code: 'too_many_attempts', details: { retryAfterSec: 5 } },
    });
    // Another user is not affected by this user's lock.
    const other = await t.signIn('b@example.com');
    expect((await t.recognize(a, other)).status).toBe(404);

    const joined = t.recognize(a);
    release();
    expect((await first).status).toBe(200);
    expect(await (await joined).json()).toEqual({
      dishes: [egg],
      questions: [],
    });
    expect(model.doGenerateCalls).toHaveLength(1);
    // The lock is released once the call is done.
    expect((await t.recognize(b)).status).toBe(200);
  });

  it('finishes the call after the client leaves and serves the retry from memory', async () => {
    const { model, release, signals } = gatedModel();
    const t = await setup(model);
    const id = await t.upload();
    const client = new AbortController();
    void t.recognize(id, t.cookie, client.signal).catch(() => {});
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    client.abort();
    expect(signals[0]!.aborted).toBe(false);

    release();
    const retry = await t.recognize(id);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ dishes: [egg], questions: [] });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('returns the questions, also from the cache (ADR-0020 §2)', async () => {
    const boiled = {
      name: 'Boiled egg',
      grams: 50,
      kcal: 78,
      proteinG: 6.3,
      fatG: 5.3,
      carbsG: 0.6,
    };
    const question = {
      dish: 0,
      text: 'How is it cooked?',
      guess: 0,
      options: [
        { ...boiled, label: 'Boiled' },
        { ...boiled, label: 'Fried', name: 'Fried egg', kcal: 140 },
      ],
    };
    const model = mockModel({ dishes: [egg], questions: [question] });
    const t = await setup(model);
    const id = await t.upload();
    const expected = { dishes: [egg], questions: [question] };
    expect(await (await t.recognize(id)).json()).toEqual(expected);
    expect(await (await t.recognize(id)).json()).toEqual(expected);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("applies the user's edible share after the cache and never sends it to the model (ADR-0039 §4)", async () => {
    const sapodilla = {
      ...egg,
      name: 'Sapodilla',
      grams: 540,
      kcal: 450,
      confidence: 0.9,
      grossG: 772,
      edibleRef: 'sapodilla',
      ediblePct: 'odd',
    };
    const model = mockModel({ dishes: [sapodilla] });
    const t = await setup(model);
    const id = await t.upload();
    const first = (await (await t.recognize(id)).json()) as {
      dishes: Record<string, unknown>[];
    };
    expect(first.dishes[0]).toMatchObject({
      grams: 617.6,
      kcal: 514.7,
      edible: { grossG: 772, pct: 80, source: 'ref', key: 'sapodilla' },
    });
    expect(first.dishes[0]).not.toHaveProperty('grossG');
    t.db
      .prepare(
        "INSERT INTO edible_prefs (user_id, key, pct, updated_at) VALUES ((SELECT id FROM users WHERE email = 'admin@example.com'), 'sapodilla', 35, 0)",
      )
      .run();
    const again = (await (await t.recognize(id)).json()) as typeof first;
    expect(again.dishes[0]).toMatchObject({
      grams: 270.2,
      edible: { pct: 35, source: 'user' },
    });
    expect(model.doGenerateCalls).toHaveLength(1);
    const { prompt } = model.doGenerateCalls[0]!;
    const text = prompt
      .flatMap((m) =>
        typeof m.content === 'string'
          ? [m.content]
          : m.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])),
      )
      .join('\n');
    expect(text).not.toMatch(/\b35\b/);
  });

  it('calls the model again after a failure', async () => {
    const model = mockModel(apiError(500), { dishes: [egg] });
    const t = await setup(model);
    const id = await t.upload();
    expect((await t.recognize(id)).status).toBe(503);
    expect((await t.recognize(id)).status).toBe(200);
    expect(model.doGenerateCalls).toHaveLength(2);
  });
});

describe('barcodes in recognition (ADR-0034 §2)', () => {
  const CODE = '4006381333931';
  const uploadPackage = async (t: Awaited<ReturnType<typeof setup>>) => {
    const photo = await readFile(
      join(import.meta.dirname, '../barcodes/fixtures/ean13.jpg'),
    );
    const res = await t.app.request('/api/photos', {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', cookie: t.cookie },
      body: new Uint8Array(photo),
    });
    return ((await res.json()) as { photoId: string }).photoId;
  };
  const label = (
    t: Awaited<ReturnType<typeof setup>>,
    id: string,
    barcode: string,
  ) =>
    t.app.request(`/api/photos/${id}/recognize?mode=label&barcode=${barcode}`, {
      method: 'POST',
      headers: { cookie: t.cookie, origin: 'http://localhost:3000' },
    });

  it('does not wait for Open Food Facts (AC-4.13)', async () => {
    const off = vi.fn(() => new Promise<Response>(() => {}));
    const model = mockModel({ dishes: [{ ...egg, barcode: CODE }] });
    const t = await aiSetup(model, {}, off as unknown as typeof fetch);
    cleanup = t.cleanup;
    t.db.prepare('UPDATE users SET off_enabled = 1').run();
    const id = await uploadPackage(t);

    let barcodesDone = false;
    void t.app
      .request(`/api/photos/${id}/barcodes`, {
        method: 'POST',
        headers: { cookie: t.cookie, origin: 'http://localhost:3000' },
      })
      .then(() => (barcodesDone = true));
    await vi.waitFor(() => expect(off).toHaveBeenCalled());

    const res = await t.recognize(id);
    expect(await res.json()).toEqual({
      dishes: [{ ...egg, barcode: CODE }],
      questions: [],
    });
    expect(barcodesDone).toBe(false);
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(
      `<barcodes>${CODE}</barcodes>`,
    );
  });

  it('reads the label of one code; a bad code is 400', async () => {
    const model = mockModel({ dishes: [egg] });
    const t = await setup(model);
    const id = await t.upload();
    const bad = await label(t, id, '123');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: { code: 'barcode_invalid' } });

    const res = await label(t, id, CODE);
    expect(await res.json()).toEqual({
      dishes: [{ ...egg, barcode: CODE, label: true }],
      questions: [],
    });
    // Cached apart from the plain recognition, and served again from memory.
    expect((await label(t, id, CODE)).status).toBe(200);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  describe('printed digits (ADR-0036 §3)', () => {
    const PRINTED = '8997035601383';
    const down = () => vi.fn(async () => new Response('', { status: 500 }));

    it('looks up a printed code that differs once and never sends it raw', async () => {
      const off = down();
      const model = mockModel({
        dishes: [{ ...egg, barcode: CODE, printedBarcode: PRINTED }],
      });
      const t = await aiSetup(model, {}, off as unknown as typeof fetch);
      cleanup = t.cleanup;
      t.db.prepare('UPDATE users SET off_enabled = 1').run();
      const id = await uploadPackage(t);
      const expected = {
        dishes: [
          {
            ...egg,
            barcode: CODE,
            printed: {
              code: PRINTED,
              result: { product: null, from: null, off: 'down' },
            },
          },
        ],
        questions: [],
      };
      expect(await (await t.recognize(id)).json()).toEqual(expected);
      expect(off).toHaveBeenCalledTimes(1);
      expect(String(off.mock.calls[0]![0])).toContain(PRINTED);
      // A retry is served from memory: no second model call, no second lookup.
      expect(await (await t.recognize(id)).json()).toEqual(expected);
      expect(model.doGenerateCalls).toHaveLength(1);
      expect(off).toHaveBeenCalledTimes(1);
    });

    it('does not look up printed digits equal to a tag code or invalid (AC-7, AC-8, AC-10)', async () => {
      const off = down();
      const model = mockModel({
        dishes: [
          { ...egg, barcode: CODE, printedBarcode: CODE },
          { ...egg, printedBarcode: CODE },
          { ...egg, printedBarcode: '8997035601384' },
        ],
      });
      const t = await aiSetup(model, {}, off as unknown as typeof fetch);
      cleanup = t.cleanup;
      t.db.prepare('UPDATE users SET off_enabled = 1').run();
      const id = await uploadPackage(t);
      expect(await (await t.recognize(id)).json()).toEqual({
        dishes: [{ ...egg, barcode: CODE }, egg, egg],
        questions: [],
      });
      expect(off).not.toHaveBeenCalled();
    });

    it('with OFF off finds the printed code among own products only (AC-9)', async () => {
      const off = down();
      const model = mockModel({
        dishes: [{ ...egg, barcode: CODE, printedBarcode: PRINTED }],
      });
      const t = await aiSetup(model, {}, off as unknown as typeof fetch);
      cleanup = t.cleanup;
      t.db
        .prepare(
          `INSERT INTO user_products (user_id, code, name, kcal_100, per, created_at, updated_at)
           SELECT id, ?, 'Pocari', 11, 'ml', 0, 0 FROM users`,
        )
        .run(PRINTED);
      const id = await uploadPackage(t);
      const body = (await (await t.recognize(id)).json()) as {
        dishes: { printed?: { result: { from: string; off: string } } }[];
      };
      expect(body.dishes[0]!.printed!.result).toMatchObject({
        from: 'mine',
        off: 'skipped',
      });
      expect(off).not.toHaveBeenCalled();
    });
  });
});
