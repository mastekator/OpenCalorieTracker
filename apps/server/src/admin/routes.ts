import { readFile, rm } from 'node:fs/promises';
import { Hono } from 'hono';
import {
  AI_PROVIDERS,
  aiDraftSchema,
  aiModelsRequestSchema,
  aiTestRunSummarySchema,
  aiTestStartRequestSchema,
  createInviteRequestSchema,
  refineLimitRequestSchema,
  saveAiSettingsRequestSchema,
  userKeysRequestSchema,
  type AdminAiStatus,
  type AiCheckResult,
  type AiDraft,
  type AiModelsResponse,
  type AiTestPhoto,
  type AiTestRun,
  type AdminBlock,
  type AdminUser,
  type CreatedLinkResponse,
  type Invite,
  type UserKeysResponse,
} from '@oct/shared';
import {
  draftConnection as connectionOf,
  fetchModels,
  redacted,
  runCheck,
  throttle,
} from '../ai/check.js';
import { readExpected, TEST_PHOTOS_DIR } from '../ai/model-test/compare.js';
import { modelsMdRow, reportMarkdown } from '../ai/model-test/format.js';
import { createModelTestRunner } from '../ai/model-test/runner.js';
import { createModel, type AiModel } from '../ai/model.js';
import {
  API_KEY_PURPOSE,
  baseUrlHost,
  refineLimit,
  savedAiRow,
  userKeysAllowed,
  type AiSettings,
} from '../ai/settings.js';
import { providerState, recordAiResult } from '../ai/status.js';
import type { AppDeps } from '../app.js';
import { DEVICE_FAILS, IP_FAILS } from '../auth/guard.js';
import { createLink, LINK_TTL } from '../auth/invites.js';
import { passkeyName } from '../auth/passkeys.js';
import { requireAdmin, type AuthEnv, type User } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { draftPath } from '../imports/draft.js';
import { deleteUserPhotos } from '../photos/store.js';

interface TestRunRow {
  id: number;
  provider: AiTestRun['provider'];
  model: string;
  status: AiTestRun['status'];
  stop_reason: AiTestRun['stopReason'];
  app_version: string;
  prompt_version: number;
  test_set: number;
  started_at: number;
  finished_at: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  photos: string;
}

function testRun(r: TestRunRow, currentSet: number): AiTestRun {
  const photos = (JSON.parse(r.photos) as AiTestPhoto[]).map((p) =>
    // A run cut by a restart never got to mark its rest (E-9).
    r.status !== 'running' && p.result === 'pending'
      ? { ...p, result: 'not_run' }
      : p,
  );
  const ms = photos.flatMap((p) => (p.ms === undefined ? [] : [p.ms]));
  const run: AiTestRun = {
    id: r.id,
    provider: r.provider,
    model: r.model,
    status: r.status,
    stopReason: r.stop_reason,
    appVersion: r.app_version,
    promptVersion: r.prompt_version,
    testSet: r.test_set,
    currentSet,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costUsd: r.cost_usd,
    passed: photos.filter((p) => p.result === 'ok').length,
    total: photos.length,
    msPerPhoto: ms.length
      ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)
      : null,
    photos,
  };
  return r.status === 'done'
    ? { ...run, modelsMdRow: modelsMdRow(run), report: reportMarkdown(run) }
    : run;
}

// passkeyName falls back to "Passkey", which says nothing about a blocked device.
const deviceName = (ua: string | null) => {
  const name = ua ? passkeyName(ua) : 'Passkey';
  return name === 'Passkey' ? ua : name;
};

/** Admin-only API (ADR-0003); everything under /api/admin answers 403 to other users (AC-2.8). */
export function adminRoutes({ config, db, ai, secrets }: AppDeps) {
  const publicUrl = () => {
    if (!config.publicUrl) throw new ApiError(409, 'not_configured');
    return config.publicUrl;
  };
  const id = (raw: string) => {
    const n = Number(raw);
    if (!Number.isSafeInteger(n)) throw new ApiError(404, 'not_found');
    return n;
  };

  const tests = createModelTestRunner(db);
  const testRow = (raw: string) => {
    const row = db
      .prepare('SELECT * FROM ai_test_runs WHERE id = ?')
      .get(id(raw)) as TestRunRow | undefined;
    if (!row) throw new ApiError(404, 'not_found');
    return row;
  };

  const aiStatus = async (): Promise<AdminAiStatus> => {
    const { settings = null, model = null } = ai.current() ?? {};
    const saved = savedAiRow(db, secrets);
    // An unreadable saved key: nothing is active, the screen shows what was saved (E-2).
    const shown = settings ?? (saved?.keyUnreadable ? saved : null);
    const { state, checkedAt, details } = providerState(model);
    return {
      provider: shown?.provider ?? null,
      providerName: shown ? AI_PROVIDERS[shown.provider].name : null,
      model: shown?.model ?? null,
      keySet: !!settings?.apiKey,
      baseUrlHost: baseUrlHost(shown),
      source: settings?.source ?? null,
      keyLast4: settings?.source === 'env' ? null : (saved?.keyLast4 ?? null),
      keyUnreadable: !!saved?.keyUnreadable,
      savedInactive: settings?.source === 'env' && !!saved,
      rev: saved?.rev ?? null,
      refineLimit: refineLimit(db),
      allowUserKeys: userKeysAllowed(db, config),
      userKeysLocked: config.ai.userKeys !== undefined,
      state,
      testPhotoCount: (await readExpected()).photos.length,
      checkedAt,
      ...redacted(details, settings?.apiKey),
    };
  };
  // Separate, so Save right after a passed check is not refused.
  const throttleCheck = throttle();
  const throttleSave = throttle();

  const envManaged = () => {
    if (config.ai.provider) throw new ApiError(409, 'ai_env_managed');
  };

  /** The admin sees only the host, so the saved key and address stand in for missing ones. */
  const draftConnection = (
    draft: Pick<AiDraft, 'provider' | 'apiKey' | 'baseUrl'>,
  ) => {
    // Under AI_* in env the saved row does nothing: the env key stands in (AC-0.2, test the current model).
    const active = ai.current()?.settings;
    return connectionOf(
      draft,
      active?.source === 'env' ? active : savedAiRow(db, secrets),
    );
  };
  const draftSettings = (draft: AiDraft): AiSettings => ({
    provider: draft.provider,
    model: draft.model,
    ...draftConnection(draft),
    source: 'admin',
  });

  return (
    new Hono<AuthEnv & { Variables: { user: User } }>()
      .use('/admin/*', requireAdmin)
      .get('/admin/ai', async (c) => c.json(await aiStatus()))
      // Without a body: the active model, its result becomes the global state. With a draft:
      // nothing is saved or recorded (ADR-0018 §4).
      .post('/admin/ai/check', async (c) => {
        const raw = await c.req.text();
        if (!raw) {
          const model = ai.current()?.model;
          if (!model) throw new ApiError(409, 'ai_not_configured');
          throttleCheck();
          await runCheck(model, ai.current()?.settings.apiKey);
          return c.json(await aiStatus());
        }
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new ApiError(400, 'validation_failed');
        }
        const parsed = aiDraftSchema.safeParse(body);
        if (!parsed.success) throw new ApiError(400, 'validation_failed');
        const settings = draftSettings(parsed.data);
        throttleCheck();
        const { state, checkedAt, details } = await runCheck(
          (await createModel(settings))!,
          settings.apiKey,
        );
        return c.json({
          state,
          checkedAt,
          ...redacted(details, settings.apiKey),
        } satisfies AiCheckResult);
      })
      .put(
        '/admin/ai/settings',
        validate('json', saveAiSettingsRequestSchema),
        async (c) => {
          const { force, rev, ...draft } = c.req.valid('json');
          envManaged();
          const staleRev = () => {
            if ((savedAiRow(db, secrets)?.rev ?? null) !== rev)
              throw new ApiError(409, 'ai_settings_changed');
          };
          staleRev();
          const settings = draftSettings(draft);
          let checked: AiModel | undefined;
          if (!force) {
            throttleSave();
            const model = (await createModel(settings))!;
            const { state, details } = await runCheck(model, settings.apiKey);
            if (state !== 'ok')
              throw new ApiError(422, 'ai_check_failed', {
                state,
                ...redacted(details, settings.apiKey),
              });
            checked = model;
          }
          // Another save may have landed while the check ran.
          staleRev();
          db.prepare(
            `INSERT INTO ai_settings (id, provider, model, base_url, api_key_enc, api_key_last4, rev, updated_at, updated_by)
             VALUES (1, @provider, @model, @baseUrl, @enc, @last4, @rev, @now, @by)
             ON CONFLICT (id) DO UPDATE SET provider = @provider, model = @model, base_url = @baseUrl,
               api_key_enc = @enc, api_key_last4 = @last4, rev = @rev, updated_at = @now, updated_by = @by`,
          ).run({
            provider: settings.provider,
            model: settings.model,
            baseUrl: settings.baseUrl ?? null,
            enc: settings.apiKey
              ? secrets.seal(settings.apiKey, API_KEY_PURPOSE)
              : null,
            last4: settings.apiKey?.slice(-4) ?? null,
            rev: (rev ?? 0) + 1,
            now: Date.now(),
            by: c.var.user.id,
          });
          await ai.apply(settings, checked);
          // apply() starts the new model at unknown; the check before saving already ran it (AC-1.4).
          if (checked) recordAiResult(checked);
          console.log(
            `[info] AI settings changed by admin: provider ${settings.provider}, model ${settings.model}`,
          );
          return c.json(await aiStatus());
        },
      )
      .delete('/admin/ai/settings', async (c) => {
        envManaged();
        db.prepare('DELETE FROM ai_settings').run();
        await ai.apply(null);
        console.log('[info] AI turned off by admin');
        return c.json(await aiStatus());
      })
      // Not envManaged(): the limit lives apart from AI_* and is set either way (ADR-0020 §6).
      .put(
        '/admin/ai/refine-limit',
        validate('json', refineLimitRequestSchema),
        async (c) => {
          const { limit } = c.req.valid('json');
          db.prepare(
            `INSERT INTO ai_limits (id, refine_per_session) VALUES (1, ?)
             ON CONFLICT (id) DO UPDATE SET refine_per_session = excluded.refine_per_session`,
          ).run(limit);
          return c.json(await aiStatus());
        },
      )
      // Turning off deletes every saved key at once, not just hides them (ADR-0031 §2).
      .put(
        '/admin/ai/user-keys',
        validate('json', userKeysRequestSchema),
        (c) => {
          if (config.ai.userKeys !== undefined)
            throw new ApiError(409, 'user_ai_keys_env_managed');
          const { allow } = c.req.valid('json');
          const deleted = db.transaction(() => {
            db.prepare('UPDATE instance_ai SET allow_user_keys = ?').run(
              +allow,
            );
            if (allow) return 0;
            db.prepare(
              'UPDATE users SET ai_notice_seen = 0 WHERE id IN (SELECT user_id FROM user_ai_settings)',
            ).run();
            return db.prepare('DELETE FROM user_ai_settings').run().changes;
          })();
          if (deleted)
            console.log(`[info] ${deleted} own AI keys deleted by admin`);
          return c.json({ deleted } satisfies UserKeysResponse);
        },
      )
      // No throttle and no global state: listing models costs nothing and changes nothing.
      .post(
        '/admin/ai/models',
        validate('json', aiModelsRequestSchema),
        async (c) => {
          const draft = c.req.valid('json');
          const { apiKey, baseUrl } = draftConnection(draft);
          return c.json({
            models: await fetchModels({ ...draft, apiKey, baseUrl }),
          } satisfies AiModelsResponse);
        },
      )
      // The active model when the draft is the active settings, so its calls set the status
      // (AC-2.13); otherwise a temporary one the status ignores. Taken once: a save mid-run keeps it (E-3).
      .post(
        '/admin/ai/tests',
        validate('json', aiTestStartRequestSchema),
        async (c) => {
          const settings = draftSettings(c.req.valid('json'));
          const active = ai.current();
          const same =
            active &&
            active.settings.provider === settings.provider &&
            active.settings.model === settings.model &&
            active.settings.apiKey === settings.apiKey &&
            (active.settings.baseUrl ?? null) === (settings.baseUrl ?? null);
          const runningId = tests.runningId();
          if (runningId !== null)
            throw new ApiError(409, 'ai_test_running', { id: runningId });
          const model = same ? active.model : (await createModel(settings))!;
          const testId = await tests.start(settings, model);
          return c.json({ id: testId }, 201);
        },
      )
      .get('/admin/ai/tests', async (c) => {
        const rows = db
          .prepare('SELECT * FROM ai_test_runs ORDER BY id DESC')
          .all() as TestRunRow[];
        const { set } = await readExpected();
        return c.json(
          rows.map((r) => aiTestRunSummarySchema.parse(testRun(r, set))),
        );
      })
      .get('/admin/ai/tests/:id', async (c) => {
        const row = testRow(c.req.param('id'));
        return c.json(testRun(row, (await readExpected()).set));
      })
      .post('/admin/ai/tests/:id/stop', (c) => {
        tests.stop(testRow(c.req.param('id')).id);
        return c.body(null, 204);
      })
      .delete('/admin/ai/tests/:id', (c) => {
        const row = testRow(c.req.param('id'));
        if (row.status === 'running')
          throw new ApiError(409, 'ai_test_running', { id: row.id });
        db.prepare('DELETE FROM ai_test_runs WHERE id = ?').run(row.id);
        return c.body(null, 204);
      })
      // Clear all: the running one stays.
      .delete('/admin/ai/tests', (c) => {
        db.prepare("DELETE FROM ai_test_runs WHERE status != 'running'").run();
        return c.body(null, 204);
      })
      // Thumbnails for the model test table (ADR-0019): only names from expected.json, so no path tricks.
      .get('/admin/ai/test-photos/:file', async (c) => {
        const file = c.req.param('file');
        if (!(await readExpected()).photos.some((e) => e.file === file))
          throw new ApiError(404, 'not_found');
        const data = await readFile(new URL(file, TEST_PHOTOS_DIR));
        return c.body(new Uint8Array(data), 200, {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'private, max-age=86400',
        });
      })
      .get('/admin/invites', (c) => {
        const now = Date.now();
        const rows = db
          .prepare(
            `SELECT id, email, created_at, expires_at, used_at, revoked_at FROM invites
           WHERE kind = 'invite' ORDER BY created_at DESC, id DESC`,
          )
          .all() as {
          id: number;
          email: string;
          created_at: number;
          expires_at: number;
          used_at: number | null;
          revoked_at: number | null;
        }[];
        return c.json(
          rows.map((r): Invite => ({
            id: r.id,
            email: r.email,
            createdAt: r.created_at,
            expiresAt: r.expires_at,
            usedAt: r.used_at,
            revokedAt: r.revoked_at,
            status: r.used_at
              ? 'used'
              : r.revoked_at
                ? 'revoked'
                : r.expires_at <= now
                  ? 'expired'
                  : 'pending',
          })),
        );
      })
      .post(
        '/admin/invites',
        validate('json', createInviteRequestSchema),
        (c) => {
          const { email } = c.req.valid('json');
          if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
            throw new ApiError(409, 'email_taken');
          }
          const link = createLink(db, publicUrl(), {
            kind: 'invite',
            email,
            ttl: LINK_TTL,
            createdBy: c.var.user.id,
          });
          return c.json(link satisfies CreatedLinkResponse, 201);
        },
      )
      // Also revokes recovery links: their ids come back from recovery-link.
      .post('/admin/invites/:id/revoke', (c) => {
        const inviteId = id(c.req.param('id'));
        const { changes } = db
          .prepare(
            `UPDATE invites SET revoked_at = @now
           WHERE id = @id AND used_at IS NULL AND revoked_at IS NULL AND expires_at > @now`,
          )
          .run({ now: Date.now(), id: inviteId });
        if (changes) return c.body(null, 204);
        const row = db
          .prepare('SELECT used_at, revoked_at FROM invites WHERE id = ?')
          .get(inviteId) as
          { used_at: number | null; revoked_at: number | null } | undefined;
        if (!row) throw new ApiError(404, 'not_found');
        // Neither used nor revoked: it expired while the admin had the list open.
        if (row.used_at === null && row.revoked_at === null)
          throw new ApiError(410, 'invite_expired');
        throw new ApiError(409, 'invite_used');
      })
      .get('/admin/users', (c) => {
        const rows = db
          .prepare(
            `SELECT id, email, name, role, created_at, last_login_at FROM users
           ORDER BY created_at, id`,
          )
          .all() as {
          id: number;
          email: string;
          name: string | null;
          role: AdminUser['role'];
          created_at: number;
          last_login_at: number | null;
        }[];
        return c.json(
          rows.map((r): AdminUser => ({
            id: r.id,
            email: r.email,
            name: r.name,
            role: r.role,
            createdAt: r.created_at,
            lastLoginAt: r.last_login_at,
          })),
        );
      })
      // Every user row cascades (sessions, passkeys, meals…), so the user's sessions die at once (AC-8.3).
      .delete('/admin/users/:id', async (c) => {
        const userId = id(c.req.param('id'));
        if (userId === c.var.user.id) {
          throw new ApiError(409, 'cannot_delete_self');
        }
        // Draft files are named by id, so the ids are read before the rows cascade away.
        const drafts = db
          .prepare(
            "SELECT id FROM imports WHERE user_id = ? AND status = 'draft'",
          )
          .pluck()
          .all(userId) as number[];
        const { changes } = db
          .prepare('DELETE FROM users WHERE id = ?')
          .run(userId);
        if (!changes) throw new ApiError(404, 'not_found');
        try {
          await deleteUserPhotos(config.dataDir, userId);
          await Promise.all(
            drafts.map((d) =>
              rm(draftPath(config.dataDir, d), { force: true }),
            ),
          );
        } catch (err) {
          // The rows are gone already; leftover files are only disk space.
          console.error(`[error] photos of deleted user ${userId}:`, err);
        }
        return c.body(null, 204);
      })
      .get('/admin/blocks', (c) => {
        const rows = db
          .prepare(
            `SELECT id, kind, ip, blocked_at, fail_count, timeout_count, last_email, user_agent
           FROM login_guards WHERE blocked_at IS NOT NULL ORDER BY blocked_at DESC, id DESC`,
          )
          .all() as {
          id: number;
          kind: AdminBlock['kind'];
          ip: string;
          blocked_at: number;
          fail_count: number;
          timeout_count: number;
          last_email: string | null;
          user_agent: string | null;
        }[];
        return c.json(
          rows.map((r): AdminBlock => ({
            id: r.id,
            kind: r.kind,
            ip: r.ip,
            device: r.kind === 'device' ? deviceName(r.user_agent) : null,
            blockedAt: r.blocked_at,
            // Only the current window is counted per row; each timeout took a full threshold.
            failCount:
              r.timeout_count * (r.kind === 'ip' ? IP_FAILS : DEVICE_FAILS) +
              r.fail_count,
            lastEmail: r.last_email,
          })),
        );
      })
      // Deleting the row lifts the block and resets its counters (AC-8.2).
      .delete('/admin/blocks/:id', (c) => {
        const { changes } = db
          .prepare(
            'DELETE FROM login_guards WHERE id = ? AND blocked_at IS NOT NULL',
          )
          .run(id(c.req.param('id')));
        if (!changes) throw new ApiError(404, 'not_found');
        return c.body(null, 204);
      })
      .post('/admin/users/:id/recovery-link', (c) => {
        const userId = id(c.req.param('id'));
        if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) {
          throw new ApiError(404, 'not_found');
        }
        const link = createLink(db, publicUrl(), {
          kind: 'recovery',
          userId,
          ttl: LINK_TTL,
          createdBy: c.var.user.id,
        });
        return c.json(link satisfies CreatedLinkResponse, 201);
      })
  );
}
