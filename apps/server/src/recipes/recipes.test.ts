import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type {
  Meal,
  MealInput,
  Recipe,
  RecipeInput,
  SyncResponse,
} from '@oct/shared';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { photoPath } from '../photos/store.js';
import { setCookie, testApp } from '../test/app.js';

const PASSWORD = 'Correct-horse-battery-9';
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true })));
});

async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'oct-recipes-'));
  dirs.push(dataDir);
  const t = testApp({ DATA_DIR: dataDir });
  await ensureAdmin(t.config, t.db);
  const signIn = async (email: string) => {
    const res = await t.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    return setCookie(res, 'oct_session')!.split(';')[0]!;
  };
  const cookie = await signIn('admin@example.com');
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    c = cookie,
  ) => {
    const res = await t.app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: c },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    };
  };
  /** PUT from the stored version, as an up-to-date client does. */
  const put = (id: number | string, body: RecipeInput, c = cookie) => {
    const at = t.db
      .prepare('SELECT updated_at FROM recipes WHERE id = ?')
      .pluck()
      .get(Number(id)) as number | undefined;
    const updatedAt = new Date(at ?? 0).toISOString();
    return call('PUT', `/recipes/${id}`, { ...body, updatedAt }, c);
  };
  const upload = async (c = cookie) => {
    const img = await sharp({
      create: { width: 64, height: 48, channels: 3, background: '#a52' },
    })
      .jpeg()
      .toBuffer();
    const res = await t.app.request('/api/photos', {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', cookie: c },
      body: new Uint8Array(img),
    });
    return ((await res.json()) as { photoId: string }).photoId;
  };
  const addUser = async (email: string) => {
    const id = t.db
      .prepare(
        "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES (?, 'user', randomblob(16), 0) RETURNING id",
      )
      .pluck()
      .get(email) as number;
    t.db
      .prepare(
        'INSERT INTO passwords (user_id, hash, updated_at) VALUES (?, ?, 0)',
      )
      .run(id, await hashPassword(PASSWORD));
    return { id, cookie: await signIn(email) };
  };
  const adminId = t.db
    .prepare("SELECT id FROM users WHERE email = 'admin@example.com'")
    .pluck()
    .get() as number;
  const files = (photoId: string, userId = adminId) =>
    (['full', 'preview'] as const).map((s) =>
      existsSync(photoPath(dataDir, userId, photoId, s)!),
    );
  const sync = async (since: number) =>
    (await call('GET', `/sync?since=${since}`)).body as SyncResponse;
  const count = (table: string) =>
    t.db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
  return {
    ...t,
    cookie,
    call,
    put,
    upload,
    addUser,
    adminId,
    files,
    sync,
    count,
  };
}

const input = (patch: Partial<RecipeInput> = {}): RecipeInput => ({
  name: '  Плов домашний ',
  cookedG: 2100,
  servings: 6,
  note: null,
  photoId: null,
  ingredients: [
    {
      name: 'Рис',
      grams: 500,
      kcal: 1750,
      proteinG: 35,
      fatG: 5,
      carbsG: 390,
      source: 'manual',
    },
    {
      name: 'Соль',
      grams: 0,
      kcal: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      source: 'manual',
    },
  ],
  steps: [{ text: 'Промыть рис', photoId: null }],
  per100: null,
  servingG: null,
  ...patch,
});
/** A recipe without ingredients (ADR-0035). */
const typedInput = (patch: Partial<RecipeInput> = {}) =>
  input({
    name: 'Мой чизкейк',
    cookedG: null,
    servings: null,
    ingredients: [],
    per100: { kcal: 321, proteinG: 6, fatG: 22, carbsG: 25 },
    servingG: 120,
    ...patch,
  });
/** The five per-100-g columns of a recipe as stored. */
const per100Row = (t: { db: import('better-sqlite3').Database }, id: number) =>
  t.db
    .prepare(
      'SELECT per100_kcal, per100_protein_g, per100_fat_g, per100_carbs_g, serving_g FROM recipes WHERE id = ?',
    )
    .get(id);

describe('recipes', () => {
  it('creates, replaces and deletes a recipe', async () => {
    const t = await setup();
    const created = await t.call('POST', '/recipes', input());
    expect(created.status).toBe(201);
    const recipe = created.body as Recipe;
    expect(recipe).toMatchObject({
      name: 'Плов домашний',
      cookedG: 2100,
      servings: 6,
      note: null,
      photoId: null,
      lastLoggedAt: null,
      steps: [{ text: 'Промыть рис', photoId: null }],
    });
    expect(recipe.ingredients.map((i) => i.name)).toEqual(['Рис', 'Соль']);
    expect(t.db.prepare('SELECT name_key FROM recipes').pluck().get()).toBe(
      'плов домашний',
    );

    const put = await t.put(
      recipe.id,
      input({
        name: 'Плов',
        cookedG: null,
        servings: null,
        note: 'С зирой',
        ingredients: [input().ingredients[0]!],
        steps: [],
      }),
    );
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      id: recipe.id,
      name: 'Плов',
      cookedG: null,
      servings: null,
      note: 'С зирой',
      steps: [],
    });
    expect((put.body as Recipe).ingredients).toHaveLength(1);
    expect([t.count('recipe_ingredients'), t.count('recipe_steps')]).toEqual([
      1, 0,
    ]);

    expect((await t.call('DELETE', `/recipes/${recipe.id}`)).status).toBe(204);
    expect((await t.call('DELETE', `/recipes/${recipe.id}`)).status).toBe(204);
    expect([t.count('recipes'), t.count('recipe_ingredients')]).toEqual([0, 0]);
    expect(t.count('recipe_tombstones')).toBe(1);
    expect((await t.put(recipe.id, input())).status).toBe(404);
  });

  it("hides another user's recipe: 404 on PUT, 204 on DELETE without a change", async () => {
    const t = await setup();
    const other = await t.addUser('b@example.com');
    const { id } = (await t.call('POST', '/recipes', input(), other.cookie))
      .body as Recipe;
    const rev = t.db
      .prepare('SELECT sync_rev FROM users WHERE id = ?')
      .pluck()
      .get(t.adminId);
    expect((await t.put(id, input())).status).toBe(404);
    expect((await t.put('abc', input())).status).toBe(404);
    expect((await t.call('DELETE', `/recipes/${id}`)).status).toBe(204);
    expect((await t.call('DELETE', '/recipes/999')).status).toBe(204);
    expect(t.count('recipes')).toBe(1);
    expect(t.count('recipe_tombstones')).toBe(0);
    expect(
      t.db
        .prepare('SELECT sync_rev FROM users WHERE id = ?')
        .pluck()
        .get(t.adminId),
    ).toBe(rev);
  });

  it('validates the limits from shared', async () => {
    const t = await setup();
    const ingredient = input().ingredients[0]!;
    for (const bad of [
      input({ name: ' ' }),
      input({ name: 'x'.repeat(81) }),
      input({ cookedG: 0 }),
      input({ servings: 1.5 }),
      input({ ingredients: [] }),
      input({ ingredients: Array(51).fill(ingredient) }),
      input({ ingredients: [{ ...ingredient, grams: -1 }] }),
      input({ ingredients: [{ ...ingredient, source: 'recipe' as 'ai' }] }),
      input({ steps: Array(31).fill({ text: 'a', photoId: null }) }),
      input({ note: 'x'.repeat(2001) }),
    ]) {
      const res = await t.call('POST', '/recipes', bad);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'validation_failed' } });
    }
    expect(t.count('recipes')).toBe(0);
  });

  it('refuses a foreign, missing, taken or repeated photo with 400', async () => {
    const t = await setup();
    const other = await t.addUser('b@example.com');
    const foreign = await t.upload(other.cookie);
    const mine = await t.upload();
    const mealPhoto = await t.upload();
    await t.call('POST', '/meals', {
      clientId: randomUUID(),
      eatenAt: new Date().toISOString(),
      tzOffsetMin: 0,
      localDate: new Date().toISOString().slice(0, 10),
      mealType: 'lunch',
      photoId: mealPhoto,
      items: [input().ingredients[0]],
    });
    const { id } = (await t.call('POST', '/recipes', input({ photoId: mine })))
      .body as Recipe;
    for (const bad of [
      input({ photoId: foreign }),
      input({ photoId: 'A'.repeat(22) }),
      input({ photoId: 'bad id' }),
      input({ photoId: mealPhoto }),
      input({ photoId: mine }),
      input({ steps: [{ text: 'a', photoId: mine }] }),
    ]) {
      const res = await t.call('POST', '/recipes', bad);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'validation_failed' } });
    }
    const twice = await t.upload();
    const res = await t.put(
      id,
      input({ photoId: twice, steps: [{ text: 'a', photoId: twice }] }),
    );
    expect(res.body).toEqual({
      error: {
        code: 'validation_failed',
        details: [{ path: ['steps', 0, 'photoId'], code: 'custom' }],
      },
    });
    // Keeping its own photo on PUT is fine.
    expect((await t.put(id, input({ photoId: mine }))).status).toBe(200);
  });

  it('a meal cannot take a recipe photo', async () => {
    const t = await setup();
    const photo = await t.upload();
    await t.call('POST', '/recipes', input({ photoId: photo }));
    const res = await t.call('POST', '/meals', {
      clientId: randomUUID(),
      eatenAt: new Date().toISOString(),
      tzOffsetMin: 0,
      localDate: new Date().toISOString().slice(0, 10),
      mealType: 'lunch',
      photoId: photo,
      items: [input().ingredients[0]],
    });
    expect(res.body).toEqual({ error: { code: 'photo_in_use' } });
  });

  it('deletes replaced photos after PUT, keeps one moved to a step, and all on DELETE', async () => {
    const t = await setup();
    const [hero, step, spare] = [
      await t.upload(),
      await t.upload(),
      await t.upload(),
    ];
    const { id } = (
      await t.call(
        'POST',
        '/recipes',
        input({ photoId: hero, steps: [{ text: 'a', photoId: step }] }),
      )
    ).body as Recipe;
    // The hero photo moves to the step, the step photo is dropped.
    const put = await t.put(
      id,
      input({ photoId: spare, steps: [{ text: 'a', photoId: hero }] }),
    );
    expect(put.body).toMatchObject({
      photoId: spare,
      steps: [{ photoId: hero }],
    });
    expect(t.files(hero)).toEqual([true, true]);
    expect(t.files(step)).toEqual([false, false]);
    expect(t.files(spare)).toEqual([true, true]);
    // And back: from the step to the hero.
    await t.put(
      id,
      input({ photoId: hero, steps: [{ text: 'a', photoId: null }] }),
    );
    expect(t.files(hero)).toEqual([true, true]);
    expect(t.files(spare)).toEqual([false, false]);

    await t.call('DELETE', `/recipes/${id}`);
    expect(t.files(hero)).toEqual([false, false]);
  });

  it('refuses a PUT from an older version with 409, changing nothing', async () => {
    const t = await setup();
    const step = await t.upload();
    const { id, updatedAt } = (await t.call('POST', '/recipes', input()))
      .body as Recipe;
    // Another device adds a step photo.
    await t.put(id, input({ steps: [{ text: 'a', photoId: step }] }));
    const before = t.db.prepare('SELECT * FROM recipes').get();
    const stale = await t.call('PUT', `/recipes/${id}`, {
      ...input({ note: 'Старая правка' }),
      updatedAt,
    });
    expect(stale).toEqual({
      status: 409,
      body: { error: { code: 'recipe_changed' } },
    });
    expect(t.db.prepare('SELECT * FROM recipes').get()).toEqual(before);
    expect(t.files(step)).toEqual([true, true]);
    // No version at all is a validation error.
    expect((await t.call('PUT', `/recipes/${id}`, input())).status).toBe(400);
    // Two saves in a row from the fresh version each move it forward.
    expect((await t.put(id, input())).status).toBe(200);
    expect((await t.put(id, input())).status).toBe(200);
  });

  it("deletes a user's recipes with the user", async () => {
    const t = await setup();
    const other = await t.addUser('b@example.com');
    await t.call('POST', '/recipes', input(), other.cookie);
    await t.call('DELETE', `/recipes/1`, undefined, other.cookie);
    await t.call('POST', '/recipes', input(), other.cookie);
    t.db.prepare('DELETE FROM users WHERE id = ?').run(other.id);
    expect(
      [
        'recipes',
        'recipe_ingredients',
        'recipe_steps',
        'recipe_tombstones',
      ].map(t.count),
    ).toEqual([0, 0, 0, 0]);
  });

  it('syncs created, edited and deleted recipes by rev', async () => {
    const t = await setup();
    const first = await t.sync(0);
    expect(first.recipes).toBeUndefined();
    expect(first.deletedRecipeIds).toBeUndefined();

    const a = (await t.call('POST', '/recipes', input())).body as Recipe;
    const b = (await t.call('POST', '/recipes', input({ name: 'Суп' })))
      .body as Recipe;
    const all = await t.sync(first.rev);
    expect(all.recipes).toEqual([a, b]);

    await t.put(a.id, input({ name: 'Плов 2' }));
    await t.call('DELETE', `/recipes/${b.id}`);
    const next = await t.sync(all.rev);
    expect(next.recipes?.map((r) => r.name)).toEqual(['Плов 2']);
    expect(next.recipes?.[0]?.ingredients).toHaveLength(2);
    expect(next.deletedRecipeIds).toEqual([b.id]);

    const none = await t.sync(next.rev);
    expect([none.recipes, none.deletedRecipeIds]).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('saves a recipe without ingredients, blank macros as 0, and syncs it', async () => {
    const t = await setup();
    const first = await t.sync(0);
    const created = await t.call(
      'POST',
      '/recipes',
      // Blank macros may come as null or be left out (ADR-0035 §2).
      {
        ...typedInput(),
        per100: { kcal: 321, proteinG: null },
        servingG: null,
      },
    );
    expect(created.status).toBe(201);
    const r = created.body as Recipe;
    expect(r).toMatchObject({
      ingredients: [],
      per100: { kcal: 321, proteinG: 0, fatG: 0, carbsG: 0 },
      servingG: null,
    });
    expect((await t.sync(first.rev)).recipes).toEqual([r]);
    expect(
      (await t.call('POST', '/recipes', { ...typedInput(), per100: null }))
        .status,
    ).toBe(400);
  });

  it('PUT switches between ingredients and per 100 g both ways', async () => {
    const t = await setup();
    const { id } = (await t.call('POST', '/recipes', input())).body as Recipe;
    expect(per100Row(t, id)).toEqual({
      per100_kcal: null,
      per100_protein_g: null,
      per100_fat_g: null,
      per100_carbs_g: null,
      serving_g: null,
    });

    const typed = await t.put(id, typedInput());
    expect(typed.status).toBe(200);
    expect(typed.body).toMatchObject({
      ingredients: [],
      cookedG: null,
      servings: null,
      per100: { kcal: 321, proteinG: 6, fatG: 22, carbsG: 25 },
      servingG: 120,
    });
    expect(t.count('recipe_ingredients')).toBe(0);
    const synced = await t.sync(0);
    expect(synced.recipes).toEqual([typed.body]);

    const back = await t.put(id, input());
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ per100: null, servingG: null });
    expect((back.body as Recipe).ingredients).toHaveLength(2);
    expect(per100Row(t, id)).toEqual({
      per100_kcal: null,
      per100_protein_g: null,
      per100_fat_g: null,
      per100_carbs_g: null,
      serving_g: null,
    });
  });

  it('is 401 without a session', async () => {
    const t = await setup();
    expect((await t.call('POST', '/recipes', input(), '')).status).toBe(401);
  });
});

describe('portions logged from a recipe (ADR-0023 §5)', () => {
  const portion = (recipeId?: number) => ({
    name: 'Плов',
    grams: 300,
    kcal: 450,
    proteinG: 10,
    fatG: 12,
    carbsG: 70,
    source: 'recipe' as const,
    ...(recipeId === undefined ? {} : { recipeId }),
  });
  const meal = (
    items: MealInput['items'],
    eatenAt = '2026-01-10T12:00:00.000Z',
  ): MealInput => ({
    clientId: randomUUID(),
    eatenAt,
    tzOffsetMin: 0,
    localDate: eatenAt.slice(0, 10),
    mealType: 'lunch',
    items,
  });
  const recipeRow = (t: Awaited<ReturnType<typeof setup>>, id: number) =>
    t.db
      .prepare('SELECT last_logged_at AS at, rev FROM recipes WHERE id = ?')
      .get(id) as { at: number | null; rev: number };

  it('links the dish and moves last_logged_at and rev forward only, once per meal', async () => {
    const t = await setup();
    const { id } = (await t.call('POST', '/recipes', input())).body as Recipe;
    const before = recipeRow(t, id);
    const since = (await t.sync(0)).rev;

    const created = await t.call(
      'POST',
      '/meals',
      meal([portion(id), portion(id)]),
    );
    expect(created.status).toBe(201);
    const saved = created.body as Meal;
    expect(saved.items.map((i) => i.recipeId)).toEqual([id, id]);
    const after = recipeRow(t, id);
    expect(after.at).toBe(Date.parse('2026-01-10T12:00:00.000Z'));
    expect(after.rev).toBe(before.rev + 2); // the meal's rev, then one for the recipe

    const synced = await t.sync(since);
    expect(synced.meals[0]?.items[0]?.recipeId).toBe(id);
    expect(synced.recipes?.[0]?.lastLoggedAt).toBe('2026-01-10T12:00:00.000Z');

    // An earlier meal does not move it back nor touch the rev.
    await t.call(
      'POST',
      '/meals',
      meal([portion(id)], '2026-01-09T12:00:00.000Z'),
    );
    expect(recipeRow(t, id)).toEqual(after);

    // Moving the meal later without new items moves the recipe too.
    const later = '2026-01-11T08:00:00.000Z';
    const patched = await t.call('PATCH', `/meals/${saved.id}`, {
      eatenAt: later,
      tzOffsetMin: 0,
      localDate: '2026-01-11',
    });
    expect(patched.status).toBe(200);
    expect(recipeRow(t, id).at).toBe(Date.parse(later));

    // Replacing items keeps the link.
    const edited = await t.call('PATCH', `/meals/${saved.id}`, {
      items: [portion(id)],
    });
    expect((edited.body as Meal).items[0]?.recipeId).toBe(id);
  });

  it("saves a dish with another user's, a deleted or no recipe without a link", async () => {
    const t = await setup();
    const other = await t.addUser('b@example.com');
    const foreign = (await t.call('POST', '/recipes', input(), other.cookie))
      .body as Recipe;
    const gone = (await t.call('POST', '/recipes', input())).body as Recipe;
    await t.call('DELETE', `/recipes/${gone.id}`);

    const res = await t.call(
      'POST',
      '/meals',
      meal([portion(foreign.id), portion(gone.id), portion()]),
    );
    expect(res.status).toBe(201);
    expect((res.body as Meal).items.map((i) => i.recipeId)).toEqual([
      null,
      null,
      null,
    ]);
    expect(recipeRow(t, foreign.id).at).toBeNull();
  });

  it('keeps a logged dish as is after the recipe is edited or deleted (AC-4.4)', async () => {
    const t = await setup();
    const { id } = (await t.call('POST', '/recipes', input())).body as Recipe;
    const saved = (await t.call('POST', '/meals', meal([portion(id)])))
      .body as Meal;

    await t.put(id, input({ name: 'Суп', cookedG: 900 }));
    const edited = (await t.call('GET', `/meals/${saved.id}`)).body as Meal;
    expect(edited).toEqual(saved);

    await t.call('DELETE', `/recipes/${id}`);
    const deleted = (await t.call('GET', `/meals/${saved.id}`)).body as Meal;
    expect(deleted).toEqual({
      ...saved,
      items: [{ ...saved.items[0], recipeId: null }],
    });
  });
});
