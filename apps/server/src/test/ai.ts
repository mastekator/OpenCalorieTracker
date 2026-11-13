import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import sharp from 'sharp';
import { vi } from 'vitest';
import type { AiModel } from '../ai/model.js';
import { ensureAdmin } from '../auth/admin.js';
import { hashPassword } from '../auth/password.js';
import { setCookie, testApp } from './app.js';

const PASSWORD = 'Correct-horse-battery-9';

export const reply = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  finishReason: { unified: 'stop' as const, raw: undefined },
  usage: {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  },
  warnings: [],
});

export const apiError = (statusCode: number, responseBody = '') =>
  new APICallError({
    message: `provider says ${responseBody}`,
    url: 'https://provider.test',
    requestBodyValues: {},
    statusCode,
    responseBody,
  });

/** Answers each call with the next result; an Error is thrown. */
export const mockModel = (...results: unknown[]) =>
  new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'vision-1',
    doGenerate: vi.fn(async () => {
      const next = results.shift();
      if (next instanceof Error) throw next;
      return reply(next);
    }),
  });

/** An app on a temp data dir with a signed-in admin, a second user and photo helpers. */
export async function aiSetup(model: AiModel | null) {
  const dataDir = await mkdtemp(join(tmpdir(), 'oct-ai-'));
  const t = testApp({ DATA_DIR: dataDir }, model);
  await ensureAdmin(t.config, t.db);
  t.db
    .prepare(
      "INSERT INTO users (email, role, webauthn_user_id, created_at) VALUES ('b@example.com', 'user', randomblob(16), 0)",
    )
    .run();
  t.db
    .prepare(
      "INSERT INTO passwords (user_id, hash, updated_at) VALUES ((SELECT id FROM users WHERE email = 'b@example.com'), ?, 0)",
    )
    .run(await hashPassword(PASSWORD));

  const signIn = async (email: string) => {
    const res = await t.app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return setCookie(res, 'oct_session')!.split(';')[0]!;
  };
  const cookie = await signIn('admin@example.com');
  const image = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#c84' },
  })
    .jpeg()
    .toBuffer();
  const upload = async () => {
    const res = await t.app.request('/api/photos', {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', cookie },
      body: new Uint8Array(image),
    });
    return ((await res.json()) as { photoId: string }).photoId;
  };
  const recognize = (id: string, as = cookie, signal?: AbortSignal) =>
    t.app.request(`/api/photos/${id}/recognize`, {
      method: 'POST',
      headers: { cookie: as, origin: 'http://localhost:3000' },
      signal,
    });
  const status = async () =>
    (await t.app.request('/api/ai/status', { headers: { cookie } })).json();
  return {
    ...t,
    dataDir,
    cookie,
    signIn,
    upload,
    recognize,
    status,
    cleanup: () => rm(dataDir, { recursive: true }),
  };
}
