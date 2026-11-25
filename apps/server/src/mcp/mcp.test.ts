import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { MealInput } from '@oct/shared';
import { aiSetup } from '../test/ai.js';

let cleanup: (() => Promise<void>) | undefined;
const setup = async ({ enabled = true } = {}) => {
  const t = await aiSetup(null);
  cleanup = t.cleanup;
  const user = await t.signIn('b@example.com');
  const call = (method: string, path: string, body?: unknown) =>
    t.app.request(path, {
      method,
      headers: {
        cookie: user,
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  if (enabled)
    expect(
      (await call('PATCH', '/api/account/settings', { mcpEnabled: true }))
        .status,
    ).toBe(200);
  const { token } = (await (
    await call('POST', '/api/tokens', { name: 'MCP', scope: 'read' })
  ).json()) as { token: string };
  const mcp = (
    body: unknown,
    { method = 'POST', headers = {} as Record<string, string> } = {},
  ) =>
    t.app.request('/mcp', {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : typeof body === 'string'
            ? body
            : JSON.stringify(body),
    });
  const rpc = async (method: string, params?: unknown, id = 1) => {
    const res = await mcp({ jsonrpc: '2.0', id, method, params });
    expect(res.status).toBe(200);
    return res.json();
  };
  const log = async (localDate: string, kcal: number) => {
    const body: MealInput = {
      clientId: randomUUID(),
      eatenAt: `${localDate}T09:00:00.000Z`,
      tzOffsetMin: 0,
      localDate,
      mealType: 'lunch',
      items: [
        {
          name: 'Soup',
          grams: 300,
          kcal,
          proteinG: 10,
          fatG: 4,
          carbsG: 20,
          source: 'manual',
        },
      ],
    };
    expect((await call('POST', '/api/meals', body)).status).toBe(201);
  };
  return { ...t, call, mcp, rpc, log };
};

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe('MCP over Streamable HTTP (ADR-0027 §7)', () => {
  it('runs initialize → initialized → tools/list → tools/call', async () => {
    const t = await setup();
    const init = await t.rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    expect(init).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'OpenCalorieTracker' },
      },
    });
    const unknownVersion = await t.rpc('initialize', {
      protocolVersion: '2099-01-01',
    });
    expect(unknownVersion.result.protocolVersion).toBe('2025-06-18');

    const note = await t.mcp({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(note.status).toBe(202);
    expect(await note.text()).toBe('');

    const list = await t.rpc('tools/list', {}, 2);
    expect(
      list.result.tools.map((x: { name: string }) => x.name).sort(),
    ).toEqual(['get_day', 'get_days', 'get_profile', 'list_meals']);
    for (const tool of list.result.tools)
      expect(tool.inputSchema.type).toBe('object');

    await t.log('2026-03-02', 450);
    const day = await t.rpc(
      'tools/call',
      { name: 'get_day', arguments: { date: '2026-03-02' } },
      3,
    );
    expect(day.result.isError).toBeUndefined();
    expect(day.result.structuredContent).toMatchObject({
      date: '2026-03-02',
      eaten: { kcal: 450 },
    });
    expect(JSON.parse(day.result.content[0].text)).toEqual(
      day.result.structuredContent,
    );

    const meals = await t.rpc('tools/call', {
      name: 'list_meals',
      arguments: { from: '2026-03-01', to: '2026-03-03' },
    });
    expect(meals.result.structuredContent.meals).toHaveLength(1);
    expect(meals.result.structuredContent.truncated).toBeUndefined();
  });

  it('answers a batch, ping, unknown methods and bad JSON', async () => {
    const t = await setup();
    const batch = await t.mcp([
      { jsonrpc: '2.0', id: 'a', method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 'b', method: 'resources/list' },
    ]);
    expect(batch.status).toBe(200);
    expect(await batch.json()).toEqual([
      { jsonrpc: '2.0', id: 'a', result: {} },
      {
        jsonrpc: '2.0',
        id: 'b',
        error: { code: -32601, message: 'Method not found' },
      },
    ]);

    const unknownTool = await t.rpc('tools/call', { name: 'delete_all' });
    expect(unknownTool.error.code).toBe(-32602);

    const bad = await t.mcp('{"jsonrpc":');
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe(-32700);

    expect((await t.mcp(undefined, { method: 'GET' })).status).toBe(405);
  });

  it('returns tool errors as isError', async () => {
    const t = await setup();
    const badDate = await t.rpc('tools/call', {
      name: 'get_day',
      arguments: { date: 'yesterday' },
    });
    expect(badDate.result.isError).toBe(true);
    const tooLong = await t.rpc('tools/call', {
      name: 'get_days',
      arguments: { from: '2024-01-01', to: '2026-01-01' },
    });
    expect(tooLong.result.isError).toBe(true);
    expect(tooLong.result.content[0].text).toContain('period_too_long');
  });

  it('cuts list_meals at 31 days and at 200 meals', async () => {
    const t = await setup();
    await t.log('2026-01-01', 100);
    await t.log('2026-02-01', 200);
    const days = await t.rpc('tools/call', {
      name: 'list_meals',
      arguments: { from: '2026-01-01', to: '2026-03-01' },
    });
    expect(days.result.structuredContent).toMatchObject({
      from: '2026-01-01',
      to: '2026-01-31',
      truncated: true,
    });
    expect(days.result.structuredContent.meals).toHaveLength(1);

    const userId = t.db
      .prepare("SELECT id FROM users WHERE email = 'b@example.com'")
      .pluck()
      .get() as number;
    const meal = t.db
      .prepare('SELECT * FROM meals WHERE user_id = ? LIMIT 1')
      .get(userId) as Record<string, unknown>;
    const insert = t.db.prepare(
      `INSERT INTO meals (${Object.keys(meal).join(', ')})
       VALUES (${Object.keys(meal)
         .map((k) => `@${k}`)
         .join(', ')})`,
    );
    t.db.transaction(() => {
      for (let i = 0; i < 210; i++)
        insert.run({
          ...meal,
          id: null,
          client_id: randomUUID(),
          local_date: '2026-05-10',
        });
    })();
    const many = await t.rpc('tools/call', {
      name: 'list_meals',
      arguments: { from: '2026-05-10', to: '2026-05-10' },
    });
    expect(many.result.structuredContent.meals).toHaveLength(200);
    expect(many.result.structuredContent.truncated).toBe(true);
  });

  it('gives height and weight in the user units', async () => {
    const t = await setup();
    t.db
      .prepare(
        "INSERT INTO profiles (user_id, height_cm, weight_kg, updated_at) SELECT id, 180.34, 81.6466266, 0 FROM users WHERE email = 'b@example.com'",
      )
      .run();
    await t.call('PATCH', '/api/account/settings', { units: 'us' });
    const res = await t.rpc('tools/call', { name: 'get_profile' });
    expect(res.result.structuredContent).toMatchObject({
      units: 'us',
      profile: { height: 71, heightUnit: 'in', weight: 180, weightUnit: 'lb' },
    });
  });
});

describe('MCP access', () => {
  it('needs a token, the user switch and the own origin', async () => {
    const t = await setup({ enabled: false });
    const off = await t.mcp({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(off.status).toBe(403);
    expect(await off.json()).toEqual({ error: { code: 'mcp_disabled' } });
    expect(
      (await (await t.call('GET', '/api/integrations')).json()).mcp,
    ).toEqual({ enabled: false, blocked: false });

    await t.call('PATCH', '/api/account/settings', { mcpEnabled: true });
    expect(
      (await (await t.call('GET', '/api/integrations')).json()).mcp,
    ).toEqual({ enabled: true, blocked: false });
    const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
    expect((await t.mcp(ping)).status).toBe(200);
    expect(
      (await t.mcp(ping, { headers: { origin: 'https://evil.example' } }))
        .status,
    ).toBe(403);
    expect(
      (await t.mcp(ping, { headers: { origin: 'http://localhost:3000' } }))
        .status,
    ).toBe(200);
    expect((await t.mcp(ping, { headers: { authorization: '' } })).status).toBe(
      401,
    );
  });
});
