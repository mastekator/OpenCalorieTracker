import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentResponse, Profile } from '@oct/shared';
import { aiSetup, apiError, reply } from '../test/ai.js';

const EMPTY: Profile = {
  sex: null,
  birthDate: null,
  heightCm: null,
  weightKg: null,
  activity: null,
  goal: null,
  targetWeightKg: null,
  deadline: null,
};
const ASK = { extracted: {}, reply: 'How tall are you?' };
// Everything for a maintain goal at once: the turn ends in the summary.
const ALL = {
  extracted: {
    sex: 'female',
    ageYears: 30,
    height: { value: 165, unit: 'cm' },
    weight: { value: 70, unit: 'kg' },
    activity: 'light',
    goal: 'maintain',
  },
  reply: 'Thanks!',
};
const MANUAL = { kcal: 2000, proteinPct: 20, fatPct: 30, carbsPct: 50 };

/** A model answering from `turns` (an Error is thrown); the last turn repeats. */
function scriptedModel(...turns: unknown[]) {
  const doGenerate = vi.fn(async () => {
    const next = turns.length > 1 ? turns.shift() : turns[0];
    if (next instanceof Error) throw next;
    return reply(next);
  });
  return { model: new MockLanguageModelV4({ doGenerate }), doGenerate };
}

let cleanup: (() => Promise<void>) | undefined;
async function setup(model: MockLanguageModelV4 | null) {
  const t = await aiSetup(model);
  cleanup = t.cleanup;
  const call = (method: string, path: string, body?: unknown, as = t.cookie) =>
    t.app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: as },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async (res: Response | Promise<Response>) => {
    const r = await res;
    expect(r.status).toBe(200);
    return (await r.json()) as AgentResponse;
  };
  const say = (text: string) => call('POST', '/norm-agent/messages', { text });
  const profile = async () =>
    (await (await call('GET', '/profile')).json()) as {
      profile: Profile;
      manual: unknown;
      rev: number;
    };
  const count = (table: string) =>
    t.db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
  return { ...t, call, json, say, profile, count };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup?.();
  cleanup = undefined;
});

describe('GET /api/norm-agent', () => {
  it('opens a dialog from the saved profile without calling the model (AC-5.2)', async () => {
    const { model, doGenerate } = scriptedModel(ASK);
    const t = await setup(model);
    const saved = { ...EMPTY, sex: 'male' as const, heightCm: 180 };
    await t.call('PUT', '/profile', { profile: saved, manual: null });

    const first = await t.json(t.call('GET', '/norm-agent'));
    expect(first).toEqual({
      messages: [{ role: 'assistant', kind: 'opening', known: saved }],
      draft: { profile: saved, unknown: [], paceWarned: null },
      state: 'active',
      userTurns: 0,
    });
    expect(await t.json(t.call('GET', '/norm-agent'))).toEqual(first);
    expect(doGenerate).not.toHaveBeenCalled();
  });

  it('needs a session', async () => {
    const t = await setup(null);
    expect((await t.call('GET', '/norm-agent', undefined, '')).status).toBe(
      401,
    );
  });
});

describe('POST /api/norm-agent/messages', () => {
  it('saves the user message and the reply', async () => {
    const t = await setup(scriptedModel(ASK).model);
    await t.call('GET', '/norm-agent');
    const turn = await t.json(t.say('I am a woman'));
    expect(turn.messages).toEqual([
      { role: 'user', kind: 'text', text: 'I am a woman' },
      {
        role: 'assistant',
        kind: 'text',
        text: 'How tall are you?',
        ask: 'sex',
      },
    ]);
    expect(turn.userTurns).toBe(1);
    const all = await t.json(t.call('GET', '/norm-agent'));
    expect(all.messages.slice(1)).toEqual(turn.messages);
  });

  it('keeps the user message on a model error and retries it (E-5.1)', async () => {
    const { model, doGenerate } = scriptedModel(apiError(500), ASK);
    const t = await setup(model);
    await t.call('GET', '/norm-agent');
    const failed = await t.say('hi');
    expect(failed.status).toBe(503);
    const after = await t.json(t.call('GET', '/norm-agent'));
    expect(after.messages.at(-1)).toEqual({
      role: 'user',
      kind: 'text',
      text: 'hi',
    });

    const retried = await t.json(
      t.call('POST', '/norm-agent/messages', { retry: true }),
    );
    expect(retried.messages).toHaveLength(1);
    expect(retried.userTurns).toBe(1);
    expect(doGenerate).toHaveBeenCalledTimes(2);
    // Nothing left to retry once answered.
    const again = await t.call('POST', '/norm-agent/messages', { retry: true });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: { code: 'agent_not_ready' } });
  });

  it('rejects empty and over-long text', async () => {
    const t = await setup(scriptedModel(ASK).model);
    await t.call('GET', '/norm-agent');
    expect((await t.say('  ')).status).toBe(400);
    expect((await t.say('x'.repeat(501))).status).toBe(400);
  });

  it('is 409 before GET and without a model', async () => {
    const t = await setup(null);
    expect((await t.say('hi')).status).toBe(409);
    await t.call('GET', '/norm-agent');
    const res = await t.say('hi');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'ai_not_configured' } });
    expect(t.count('agent_messages')).toBe(1);
  });

  it('offers the form once at the 20th message and closes after the 60th (AC-5.9)', async () => {
    const t = await setup(scriptedModel(ASK).model);
    await t.call('GET', '/norm-agent');
    for (let i = 1; i <= 60; i++) {
      const turn = await t.json(t.say(`message ${i}`));
      const limits = turn.messages.filter((m) => m.kind === 'limit');
      expect(limits).toHaveLength(i === 20 ? 1 : 0);
    }
    const res = await t.say('one more');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: 'agent_closed' } });
  });

  it('closes the dialog for a minor', async () => {
    const t = await setup(
      scriptedModel({ extracted: { ageYears: 15 }, reply: 'Ok' }).model,
    );
    await t.call('GET', '/norm-agent');
    expect((await t.json(t.say('I am 15'))).state).toBe('minor');
    expect((await t.say('actually 30')).status).toBe(409);
  });

  it('allows one turn per user at a time', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        await gate;
        return reply(ASK);
      },
    });
    const t = await setup(model);
    await t.call('GET', '/norm-agent');
    const first = t.say('one');
    await vi.waitFor(() => expect(t.count('agent_messages')).toBe(2));
    for (const res of [
      await t.say('two'),
      await t.call('POST', '/norm-agent/edit'),
      await t.call('POST', '/norm-agent/apply'),
      await t.call('DELETE', '/norm-agent'),
    ]) {
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({
        error: { code: 'too_many_attempts', details: { retryAfterSec: 5 } },
      });
    }
    release();
    expect((await first).status).toBe(200);
    expect((await t.say('two')).status).toBe(200);
  });
});

describe('summary, edit, apply', () => {
  it('applies the draft and clears the manual norm (E-3.1)', async () => {
    const t = await setup(scriptedModel(ALL).model);
    await t.call('PUT', '/profile', { profile: EMPTY, manual: MANUAL });
    const saved = await t.profile();
    await t.call('GET', '/norm-agent');

    const early = await t.call('POST', '/norm-agent/apply');
    expect(early.status).toBe(409);
    expect(await early.json()).toEqual({ error: { code: 'agent_not_ready' } });

    const turn = await t.json(t.say('everything'));
    expect(turn.state).toBe('summary');
    expect(turn.messages.at(-1)?.kind).toBe('summary');
    // Leaving without apply changes nothing (AC-5.10).
    expect((await t.profile()).profile).toEqual(EMPTY);

    const res = await t.call('POST', '/norm-agent/apply');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profile: Profile;
      manual: unknown;
      rev: number;
    };
    expect(body).toEqual(await t.profile());
    expect(body.manual).toBeNull();
    // A new rev, so other devices get the profile on sync (ADR-0011 §3).
    expect(body.rev).toBeGreaterThan(saved.rev);
    expect(body.profile).toMatchObject({
      sex: 'female',
      heightCm: 165,
      weightKg: 70,
      goal: 'maintain',
    });
    // The applied dialog is gone; the next one starts from the new profile.
    expect(t.count('agent_messages')).toBe(0);
    const next = await t.json(t.call('GET', '/norm-agent'));
    expect(next.draft.profile).toEqual(body.profile);
  });

  it('changes nothing when apply fails (AC-5.12)', async () => {
    const t = await setup(scriptedModel(ALL).model);
    await t.call('PUT', '/profile', { profile: EMPTY, manual: MANUAL });
    const before = await t.profile();
    await t.call('GET', '/norm-agent');
    await t.say('everything');
    t.db.exec(
      "CREATE TRIGGER fail BEFORE UPDATE ON profiles BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await t.call('POST', '/norm-agent/apply')).status).toBe(500);
    expect(await t.profile()).toEqual(before);
    expect((await t.json(t.call('GET', '/norm-agent'))).state).toBe('summary');
  });

  it('returns from the summary to the dialog on edit (AC-5.8)', async () => {
    const t = await setup(scriptedModel(ALL).model);
    await t.call('GET', '/norm-agent');
    expect((await t.call('POST', '/norm-agent/edit')).status).toBe(409);
    await t.say('everything');
    const edit = await t.json(t.call('POST', '/norm-agent/edit'));
    expect(edit.messages).toEqual([{ role: 'assistant', kind: 'edit' }]);
    expect(edit.state).toBe('active');
    expect((await t.call('POST', '/norm-agent/apply')).status).toBe(409);
  });
});

describe('DELETE /api/norm-agent, ownership', () => {
  it('clears the dialog but not the profile', async () => {
    const t = await setup(scriptedModel(ALL).model);
    await t.call('GET', '/norm-agent');
    await t.say('everything');
    const before = await t.profile();
    expect((await t.call('DELETE', '/norm-agent')).status).toBe(204);
    expect(t.count('agent_messages')).toBe(0);
    expect(t.count('agent_drafts')).toBe(0);
    expect(await t.profile()).toEqual(before);
  });

  it("never shows another user's dialog (AC-0.1)", async () => {
    const t = await setup(scriptedModel(ASK).model);
    await t.call('GET', '/norm-agent');
    await t.say('secret');
    const other = await t.signIn('b@example.com');
    const theirs = await t.json(t.call('GET', '/norm-agent', undefined, other));
    expect(theirs.messages).toEqual([
      { role: 'assistant', kind: 'opening', known: EMPTY },
    ]);
    expect(
      (await t.call('DELETE', '/norm-agent', undefined, other)).status,
    ).toBe(204);
    expect((await t.json(t.call('GET', '/norm-agent'))).messages).toHaveLength(
      3,
    );
  });

  it('is deleted with the user', async () => {
    const t = await setup(scriptedModel(ASK).model);
    await t.call('GET', '/norm-agent');
    await t.say('hi');
    t.db.prepare("DELETE FROM users WHERE email = 'admin@example.com'").run();
    expect(t.count('agent_messages')).toBe(0);
    expect(t.count('agent_drafts')).toBe(0);
  });
});
