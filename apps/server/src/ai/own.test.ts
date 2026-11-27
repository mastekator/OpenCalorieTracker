import { lookup } from 'node:dns/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModel } from './model.js';
import { aiSetup, apiError, mockModel } from '../test/ai.js';

vi.mock('./model.js', () => ({ createModel: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

// No sk- prefix: providerText would mask that one anyway.
const KEY = 'my-very-own-SECRET-9876';
const draft = { provider: 'openai', model: 'gpt-x', apiKey: KEY };
const compatible = {
  provider: 'openai-compatible',
  model: 'm',
  baseUrl: 'https://llm.example.com/v1',
  apiKey: KEY,
};

let cleanup: (() => Promise<void>) | undefined;
let log: ReturnType<typeof vi.spyOn>;

const setup = async (env: Record<string, string> = {}) => {
  const t = await aiSetup(null, env);
  cleanup = t.cleanup;
  const user = await t.signIn('b@example.com');
  const req =
    (method: string, path = '') =>
    (body?: unknown, cookie = user) =>
      t.app.request(`/api/ai/own${path}`, {
        method,
        headers: {
          cookie,
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
  const rows = () => t.db.prepare('SELECT * FROM user_ai_settings').all();
  return {
    ...t,
    user,
    get: req('GET'),
    put: req('PUT'),
    del: req('DELETE'),
    check: req('POST', '/check'),
    models: req('POST', '/models'),
    rows,
  };
};
const logged = () => log.mock.calls.map((c) => c.join(' ')).join('\n');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(lookup).mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
  ] as never);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(createModel).mockReset();
  await cleanup?.();
  cleanup = undefined;
});

describe('/api/ai/own', () => {
  it('checks, saves sealed and shows only the last 4 characters', async () => {
    const t = await setup();
    expect(await (await t.get()).json()).toBeNull();
    vi.mocked(createModel).mockResolvedValueOnce(mockModel('OK'));
    const res = await t.put(draft);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({
      provider: 'openai',
      model: 'gpt-x',
      baseUrl: null,
      keyLast4: '9876',
      keyUnreadable: false,
      state: 'ok',
      checkedAt: expect.any(Number),
    });
    const [row] = t.rows() as { api_key_enc: string }[];
    expect(row!.api_key_enc).toMatch(/^v1\./);
    expect(row!.api_key_enc).not.toContain(KEY);
    expect(await (await t.get()).text()).toBe(body);
  });

  it('keeps the saved key without apiKey for the same provider only', async () => {
    const t = await setup();
    vi.mocked(createModel).mockImplementation(async () => mockModel('OK'));
    await t.put(draft);
    vi.setSystemTime(Date.now() + 10_000);
    expect((await t.put({ ...draft, apiKey: undefined })).status).toBe(200);
    expect(createModel).toHaveBeenLastCalledWith(
      expect.objectContaining({ apiKey: KEY }),
      undefined,
    );
    const other = await t.put({ provider: 'anthropic', model: 'c' });
    expect(await other.json()).toEqual({
      error: { code: 'ai_key_required' },
    });
  });

  it('refuses the ChatGPT subscription as an own key (ADR-0031 §4)', async () => {
    const t = await setup();
    const res = await t.put({ provider: 'chatgpt', model: 'gpt-5.4' });
    expect(res.status).toBe(400);
    expect(createModel).not.toHaveBeenCalled();
  });

  it('saves nothing when the check fails, and the key is in no answer or log', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValueOnce(
      mockModel(apiError(401, `invalid key ${KEY}`)),
    );
    const res = await t.put(draft);
    expect(res.status).toBe(422);
    const body = await res.text();
    expect(JSON.parse(body)).toMatchObject({
      error: {
        code: 'ai_check_failed',
        details: { state: 'auth_error', details: { status: 401 } },
      },
    });
    expect(t.rows()).toEqual([]);
    expect(logged()).toContain('ai.check');
    for (const text of [body, logged()]) expect(text).not.toContain(KEY);
  });

  it('is only the user’s own row', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValueOnce(mockModel('OK'));
    await t.put(draft);
    expect(await (await t.get(undefined, t.cookie)).json()).toBeNull();
    expect(await (await t.del(undefined, t.cookie)).json()).toBeNull();
    expect(t.rows()).toHaveLength(1);
    expect(await (await t.del()).json()).toBeNull();
    expect(t.rows()).toEqual([]);
  });

  it('allows one check per 10 s per user', async () => {
    const t = await setup();
    expect((await t.check()).status).toBe(409);
    vi.mocked(createModel).mockImplementation(async () =>
      mockModel(apiError(429, `quota for ${KEY}`)),
    );
    vi.mocked(createModel).mockResolvedValueOnce(mockModel('OK'));
    await t.put(draft);
    vi.setSystemTime(Date.now() + 10_000);
    const first = await t.check();
    expect(await first.json()).toMatchObject({ state: 'quota_exceeded' });
    expect((await t.check()).status).toBe(429);
    const text = await (await t.get()).text();
    expect(JSON.parse(text)).toMatchObject({ state: 'quota_exceeded' });
    expect(text).not.toContain(KEY);
  });

  it('lists models with the saved key', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValueOnce(mockModel('OK'));
    await t.put(draft);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: [{ id: 'gpt-x' }] }));
    const res = await t.models({ provider: 'openai' });
    expect(await res.json()).toEqual({
      models: [{ id: 'gpt-x', vision: null }],
    });
    expect(fetch.mock.calls[0]![1]!.headers).toEqual({
      Authorization: `Bearer ${KEY}`,
    });
  });

  it('is 403 while own keys are off, and GET still clears the notice', async () => {
    const t = await setup({ ALLOW_USER_AI_KEYS: 'false' });
    t.db.prepare('UPDATE users SET ai_notice_seen = 0').run();
    for (const res of [
      await t.get(),
      await t.put(draft),
      await t.del(),
      await t.check(),
      await t.models({ provider: 'openai' }),
    ])
      expect(await res.json()).toEqual({
        error: { code: 'ai_user_keys_disabled' },
      });
    expect(
      t.db.prepare('SELECT ai_notice_seen FROM users').pluck().all(),
    ).toEqual([0, 1]);
    expect(createModel).not.toHaveBeenCalled();
  });
});

describe('own openai-compatible address of a non-admin (SSRF)', () => {
  it.each([
    'http://llm.example.com/v1',
    'https://localhost:11434/v1',
    'https://10.0.0.5/v1',
    'https://100.64.0.1/v1',
    'https://ollama/v1',
  ])('refuses %s by name', async (baseUrl) => {
    const t = await setup();
    const res = await t.put({ ...compatible, baseUrl });
    expect(await res.json()).toEqual({
      error: { code: 'ai_base_url_private' },
    });
    expect(createModel).not.toHaveBeenCalled();
  });

  it('refuses a public name that resolves to loopback', async () => {
    const t = await setup();
    vi.mocked(lookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never);
    for (const res of [
      await t.put(compatible),
      await t.models({
        provider: 'openai-compatible',
        baseUrl: compatible.baseUrl,
      }),
    ])
      expect(await res.json()).toEqual({
        error: { code: 'ai_base_url_private' },
      });
    expect(lookup).toHaveBeenCalledWith('llm.example.com', { all: true });
    expect(createModel).not.toHaveBeenCalled();
  });

  it.each([
    [
      'fails',
      () => vi.mocked(lookup).mockRejectedValue(new Error('ENOTFOUND')),
    ],
    ['is empty', () => vi.mocked(lookup).mockResolvedValue([] as never)],
    [
      'gives a tailnet address',
      () =>
        vi
          .mocked(lookup)
          .mockResolvedValue([{ address: '100.100.1.1', family: 4 }] as never),
    ],
  ])('refuses a name whose lookup %s', async (_, mock) => {
    const t = await setup();
    mock();
    for (const res of [
      await t.put(compatible),
      await t.models({
        provider: 'openai-compatible',
        baseUrl: compatible.baseUrl,
      }),
    ])
      expect(await res.json()).toEqual({
        error: { code: 'ai_base_url_private' },
      });
    expect(createModel).not.toHaveBeenCalled();
  });

  it('accepts a public https address and guards each request', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValueOnce(mockModel('OK'));
    expect((await t.put(compatible)).status).toBe(200);
    const guard = vi.mocked(createModel).mock.calls[0]![1]!;
    vi.mocked(lookup).mockResolvedValue([
      { address: '169.254.169.254', family: 4 },
    ] as never);
    await expect(
      guard('https://llm.example.com/v1/chat'),
    ).rejects.toMatchObject({ code: 'ai_base_url_private' });
  });

  it('does not follow a redirect from a public address', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValueOnce(mockModel('OK'));
    expect((await t.put(compatible)).status).toBe(200);
    const guard = vi.mocked(createModel).mock.calls[0]![1]!;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));
    await guard('https://llm.example.com/v1/chat', { method: 'POST' });
    expect(fetchSpy).toHaveBeenCalledWith('https://llm.example.com/v1/chat', {
      method: 'POST',
      redirect: 'error',
    });
    fetchSpy.mockRestore();
  });

  it('leaves the admin’s own address alone', async () => {
    const t = await setup();
    vi.mocked(createModel).mockResolvedValueOnce(mockModel('OK'));
    const res = await t.put(
      { ...compatible, baseUrl: 'http://ollama:11434/v1' },
      t.cookie,
    );
    expect(res.status).toBe(200);
    expect(createModel).toHaveBeenCalledWith(expect.anything(), undefined);
  });
});

describe('own key in use (ADR-0031 §2)', () => {
  it('serves the user’s data, keeps its own status and is gone when keys are turned off', async () => {
    const server = mockModel();
    const t = await aiSetup(server);
    cleanup = t.cleanup;
    const user = await t.signIn('b@example.com');
    const userId = t.db
      .prepare("SELECT id FROM users WHERE email = 'b@example.com'")
      .pluck()
      .get() as number;
    const put = (body: unknown) =>
      t.app.request('/api/ai/own', {
        method: 'PUT',
        headers: {
          cookie: user,
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    vi.mocked(createModel).mockResolvedValueOnce(mockModel('OK'));
    expect((await put(draft)).status).toBe(200);
    t.db
      .prepare(
        "INSERT INTO ai_consents (user_id, provider_key, granted_at) VALUES (?, 'openai', 0)",
      )
      .run(userId);
    expect(t.ai.forUser({ id: userId })).toMatchObject({
      source: 'own_key',
      providerKey: 'openai',
      local: false,
      settings: { provider: 'openai', model: 'gpt-x', apiKey: KEY },
    });

    // A failed recognition with the own key: its status changes, the server's does not.
    const serverBefore = await t.status();
    vi.mocked(createModel).mockResolvedValueOnce(
      mockModel(apiError(401, 'bad key')),
    );
    const res = await t.recognize(await t.upload(user), user);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      error: { details: { aiSource: 'own_key' } },
    });
    expect(server.doGenerateCalls).toHaveLength(0);
    const own = await t.app.request('/api/ai/own', {
      headers: { cookie: user },
    });
    expect(await own.json()).toMatchObject({ state: 'auth_error' });
    expect(await t.status()).toEqual(serverBefore);

    // The meal recognized with the own key says so, for support (ADR-0031 §2).
    const meal = await t.app.request('/api/meals', {
      method: 'POST',
      headers: {
        cookie: user,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        clientId: crypto.randomUUID(),
        eatenAt: '2026-01-10T12:00:00.000Z',
        tzOffsetMin: 0,
        localDate: '2026-01-10',
        mealType: 'lunch',
        items: [
          {
            name: 'Egg',
            grams: 50,
            kcal: 78,
            proteinG: 6,
            fatG: 5,
            carbsG: 1,
            source: 'ai',
            confidence: 0.9,
          },
        ],
      }),
    });
    expect(meal.status).toBe(201);
    expect(
      t.db
        .prepare(
          'SELECT m.ai_source, i.ai_provider, i.ai_model FROM meals m JOIN meal_items i ON i.meal_id = m.id',
        )
        .get(),
    ).toEqual({
      ai_source: 'own_key',
      ai_provider: 'openai',
      ai_model: 'gpt-x',
    });

    t.db.prepare('UPDATE instance_ai SET allow_user_keys = 0').run();
    expect(t.ai.forUser({ id: userId })?.source).toBe('server');
  });
});
