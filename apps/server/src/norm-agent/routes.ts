import { Hono } from 'hono';
import {
  agentMessageRequestSchema,
  profileSchema,
  type AgentResponse,
  type ChatMessage,
  type InterviewDraft,
  type InterviewState,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { normInterview } from '../ai/interview.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import { validate } from '../http/validate.js';
import { readProfile, writeProfile } from '../profile/norm.js';
import { serverToday } from '../profile/routes.js';
import { advanceInterview } from './advance.js';

/** User messages before the one-time "switch to the form" offer, and the hard cap (ADR-0015 §7). */
const LIMIT_OFFER_AT = 20;
const MAX_USER_TURNS = 60;

interface DraftRow {
  draft: string;
  state: InterviewState;
  user_turns: number;
  limit_offered: 0 | 1;
}

/** The norm agent dialog of the current user (ADR-0015 §5). State is per app instance. */
export function normAgentRoutes({ db, model = null }: AppDeps) {
  // Users with a model turn in flight: one at a time, and no edit/apply/delete under it.
  const running = new Set<number>();
  const idle = (userId: number) => {
    if (running.has(userId))
      throw new ApiError(429, 'too_many_attempts', { retryAfterSec: 5 });
  };

  const readRow = (userId: number) =>
    db
      .prepare(
        'SELECT draft, state, user_turns, limit_offered FROM agent_drafts WHERE user_id = ?',
      )
      .get(userId) as DraftRow | undefined;

  const readMessages = (userId: number) =>
    (
      db
        .prepare(
          'SELECT role, kind, content FROM agent_messages WHERE user_id = ? ORDER BY id',
        )
        .all(userId) as { role: string; kind: string; content: string }[]
    ).map(
      ({ role, kind, content }) =>
        ({ role, kind, ...JSON.parse(content) }) as ChatMessage,
    );

  const insert = db.prepare(
    'INSERT INTO agent_messages (user_id, role, kind, content, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const addMessages = (userId: number, messages: ChatMessage[]) => {
    for (const { role, kind, ...rest } of messages)
      insert.run(userId, role, kind, JSON.stringify(rest), Date.now());
  };

  const respond = (userId: number, messages: ChatMessage[]): AgentResponse => {
    const row = readRow(userId)!;
    return {
      messages,
      draft: JSON.parse(row.draft) as InterviewDraft,
      state: row.state,
      userTurns: row.user_turns,
    };
  };

  return new Hono<AuthEnv>()
    .get('/norm-agent', requireUser, (c) => {
      const userId = c.var.user.id;
      db.transaction(() => {
        // The draft starts from the saved profile; no model call (AC-5.2).
        const { profile } = readProfile(db, userId);
        const draft: InterviewDraft = {
          profile,
          unknown: [],
          paceWarned: null,
        };
        const { changes } = db
          .prepare(
            "INSERT OR IGNORE INTO agent_drafts (user_id, draft, state, updated_at) VALUES (?, ?, 'active', ?)",
          )
          .run(userId, JSON.stringify(draft), Date.now());
        if (changes)
          addMessages(userId, [
            { role: 'assistant', kind: 'opening', known: profile },
          ]);
      })();
      return c.json(respond(userId, readMessages(userId)));
    })
    .post(
      '/norm-agent/messages',
      requireUser,
      validate('json', agentMessageRequestSchema),
      async (c) => {
        const user = c.var.user;
        const body = c.req.valid('json');
        idle(user.id);
        const row = readRow(user.id);
        if (
          !row ||
          row.state === 'minor' ||
          ('text' in body && row.user_turns >= MAX_USER_TURNS)
        )
          throw new ApiError(409, 'agent_closed');
        if (!model) throw new ApiError(409, 'ai_not_configured');

        const added: ChatMessage[] = [];
        if ('text' in body) {
          // Saved before the model call, so a failed turn keeps it for retry (E-5.1).
          added.push({ role: 'user', kind: 'text', text: body.text });
          db.transaction(() => {
            addMessages(user.id, added);
            db.prepare(
              'UPDATE agent_drafts SET user_turns = user_turns + 1, updated_at = ? WHERE user_id = ?',
            ).run(Date.now(), user.id);
          })();
        }
        const history = readMessages(user.id);
        if (history.at(-1)?.role !== 'user')
          throw new ApiError(409, 'agent_not_ready');

        const draft = JSON.parse(row.draft) as InterviewDraft;
        const userTurns = row.user_turns + added.length;
        const today = serverToday();
        running.add(user.id);
        try {
          // No request signal: the turn is saved even if the client goes away.
          const turn = await normInterview(
            model,
            { history, draft, today, units: user.units },
            user.locale,
          );
          const next = advanceInterview(draft, turn, {
            units: user.units,
            today,
          });
          const replies: ChatMessage[] = next.messages.map((m) => ({
            role: 'assistant',
            ...m,
          }));
          const offerLimit =
            !row.limit_offered &&
            userTurns >= LIMIT_OFFER_AT &&
            next.state === 'active';
          if (offerLimit) replies.push({ role: 'assistant', kind: 'limit' });
          db.transaction(() => {
            addMessages(user.id, replies);
            db.prepare(
              'UPDATE agent_drafts SET draft = ?, state = ?, limit_offered = limit_offered OR ?, updated_at = ? WHERE user_id = ?',
            ).run(
              JSON.stringify(next.draft),
              next.state,
              offerLimit ? 1 : 0,
              Date.now(),
              user.id,
            );
          })();
          return c.json(respond(user.id, [...added, ...replies]));
        } finally {
          running.delete(user.id);
        }
      },
    )
    .post('/norm-agent/edit', requireUser, (c) => {
      const userId = c.var.user.id;
      idle(userId);
      if (readRow(userId)?.state !== 'summary')
        throw new ApiError(409, 'agent_not_ready');
      const edit: ChatMessage = { role: 'assistant', kind: 'edit' };
      db.transaction(() => {
        addMessages(userId, [edit]);
        db.prepare(
          "UPDATE agent_drafts SET state = 'active', updated_at = ? WHERE user_id = ?",
        ).run(Date.now(), userId);
      })();
      return c.json(respond(userId, [edit]));
    })
    .post('/norm-agent/apply', requireUser, (c) => {
      const userId = c.var.user.id;
      idle(userId);
      const row = readRow(userId);
      if (row?.state !== 'summary') throw new ApiError(409, 'agent_not_ready');
      const parsed = profileSchema.safeParse(
        (JSON.parse(row.draft) as InterviewDraft).profile,
      );
      if (!parsed.success) throw new ApiError(409, 'agent_not_ready');
      // One transaction: the profile, the cleared manual norm and the closed dialog (AC-5.12, E-3.1).
      db.transaction(() => {
        writeProfile(db, userId, parsed.data, null);
        clear(userId);
      })();
      return c.json(readProfile(db, userId));
    })
    .delete('/norm-agent', requireUser, (c) => {
      const userId = c.var.user.id;
      idle(userId);
      db.transaction(() => clear(userId))();
      return c.body(null, 204);
    });

  function clear(userId: number) {
    db.prepare('DELETE FROM agent_messages WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM agent_drafts WHERE user_id = ?').run(userId);
  }
}
