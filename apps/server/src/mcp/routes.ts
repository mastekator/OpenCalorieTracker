import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import {
  addDays,
  CM_PER_INCH,
  daysBetween,
  round1,
  weightFromKg,
} from '@oct/shared';
import type { AppDeps } from '../app.js';
import { requireUser, type AuthEnv } from '../auth/session.js';
import { ApiError } from '../http/errors.js';
import {
  listMeals,
  MAX_MEAL_DAYS,
  readDay,
  readDays,
  readPublicProfile,
} from '../public-api/routes.js';
import { appVersion } from '../version.js';

/** Newest first; any other version asked for gets the newest (ADR-0027 §7). */
export const MCP_VERSIONS = ['2025-06-18', '2025-03-26'];
/** list_meals cuts a longer answer and says so with `truncated: true`. */
export const MAX_MCP_MEALS = 200;

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const date = z.iso.date().describe('A day as YYYY-MM-DD');
const period = z
  .object({
    from: date.describe('First day, YYYY-MM-DD'),
    to: date.describe('Last day, YYYY-MM-DD, inclusive'),
  })
  .refine((p) => p.from <= p.to, { message: 'to is before from' });

type Tool = {
  description: string;
  args: z.ZodType;
  run: (userId: number, args: never) => unknown;
};

const toolsOf = ({ db }: AppDeps): Record<string, Tool> => ({
  get_day: {
    description:
      "One day's eaten calories, protein, fat and carbs, the daily norm and what remains. Without a date: today in the user's time zone. Grams and kcal.",
    args: z.object({ date: date.optional() }),
    run: (userId, { date }: { date?: string }) => readDay(db, userId, date),
  },
  get_days: {
    description:
      'Totals per day for a period of up to 366 days, with the number of meals per day and the current daily norm. Grams and kcal.',
    args: period,
    run: (userId, { from, to }: { from: string; to: string }) =>
      readDays(db, userId, from, to),
  },
  list_meals: {
    description: `Meals of a period with their dishes, grams, kcal, protein, fat and carbs. At most ${MAX_MEAL_DAYS} days from \`from\` and ${MAX_MCP_MEALS} meals; a longer answer is cut and has \`truncated: true\` — ask again for a shorter period.`,
    args: period,
    run: (userId, { from, to }: { from: string; to: string }) => {
      const end =
        daysBetween(from, to) < MAX_MEAL_DAYS
          ? to
          : addDays(from, MAX_MEAL_DAYS - 1);
      const res = listMeals(db, userId, from, end);
      if (end === to && res.meals.length <= MAX_MCP_MEALS) return res;
      return {
        ...res,
        meals: res.meals.slice(0, MAX_MCP_MEALS),
        truncated: true,
        hint: 'The answer was cut; ask for a shorter period to see the rest.',
      };
    },
  },
  get_profile: {
    description:
      "The user's profile (sex, birth date, height, weight, activity, goal), units, language and today's norm. Height and weight are in the user's units: cm and kg, or inches and lb when units is 'us'.",
    args: z.object({}),
    run: (userId) => {
      const { profile, units, ...rest } = readPublicProfile(db, userId);
      const { heightCm, weightKg, targetWeightKg, ...other } = profile;
      const us = units === 'us';
      const weight = (kg: number | null) =>
        kg === null ? null : weightFromKg(kg, units);
      return {
        ...rest,
        units,
        profile: {
          ...other,
          height:
            heightCm === null
              ? null
              : us
                ? Math.round(heightCm / CM_PER_INCH)
                : round1(heightCm),
          heightUnit: us ? 'in' : 'cm',
          weight: weight(weightKg),
          targetWeight: weight(targetWeightKg),
          weightUnit: us ? 'lb' : 'kg',
        },
      };
    },
  },
});

type Id = string | number;
const requestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const rpcError = (id: Id | null, code: number, message: string) => ({
  jsonrpc: '2.0' as const,
  id,
  error: { code, message },
});

/** `Origin` from a browser must be this app's own (DNS rebinding); clients without one pass. */
const sameOrigin = (publicUrl: string | null) =>
  createMiddleware(async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined && origin !== publicUrl)
      throw new ApiError(403, 'forbidden');
    await next();
  });

/**
 * Read-only MCP over Streamable HTTP without sessions (ADR-0027 §7): JSON-RPC 2.0 in a POST,
 * one message or a batch, answered with application/json. `tokenAuth` sits on /mcp in app.ts.
 */
export function mcpRoutes(deps: AppDeps) {
  const { db, config } = deps;
  const tools = toolsOf(deps);
  const toolList = Object.entries(tools).map(([name, t]) => ({
    name,
    description: t.description,
    inputSchema: z.toJSONSchema(t.args, { io: 'input' }),
  }));

  const call = (userId: number, params: Record<string, unknown> = {}) => {
    const tool =
      typeof params.name === 'string' && Object.hasOwn(tools, params.name)
        ? tools[params.name]
        : undefined;
    if (!tool) throw new RpcError(INVALID_PARAMS, 'Unknown tool');
    // Bad arguments and API errors go back to the model as a tool error it can act on.
    const fail = (text: string) => ({
      content: [{ type: 'text', text }],
      isError: true,
    });
    const args = tool.args.safeParse(params.arguments ?? {});
    if (!args.success) return fail(z.prettifyError(args.error));
    try {
      const data = tool.run(userId, args.data as never);
      return {
        content: [{ type: 'text', text: JSON.stringify(data) }],
        structuredContent: data,
      };
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      return fail(
        JSON.stringify({ error: err.code, details: err.details ?? undefined }),
      );
    }
  };

  /** The answer to one message, or undefined for a notification or a client response. */
  const handle = (userId: number, msg: unknown) => {
    const parsed = requestSchema.safeParse(msg);
    if (!parsed.success) {
      // A client's response to a server request (we send none) needs no answer.
      if (msg && typeof msg === 'object' && !('method' in msg)) return;
      return rpcError(null, INVALID_REQUEST, 'Invalid request');
    }
    const { id, method, params } = parsed.data;
    if (id === undefined) return;
    try {
      let result: unknown;
      if (method === 'initialize') {
        const asked = params?.protocolVersion;
        result = {
          protocolVersion:
            MCP_VERSIONS.find((v) => v === asked) ?? MCP_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'OpenCalorieTracker', version: appVersion },
        };
      } else if (method === 'ping') result = {};
      else if (method === 'tools/list') result = { tools: toolList };
      else if (method === 'tools/call') result = call(userId, params);
      else throw new RpcError(METHOD_NOT_FOUND, 'Method not found');
      return { jsonrpc: '2.0' as const, id, result };
    } catch (err) {
      if (!(err instanceof RpcError)) throw err;
      return rpcError(id, err.code, err.message);
    }
  };

  return new Hono<AuthEnv>()
    .use(sameOrigin(config.publicUrl))
    .use(requireUser)
    .use(async (c, next) => {
      const on = db
        .prepare('SELECT mcp_enabled FROM users WHERE id = ?')
        .pluck()
        .get(c.var.user!.id);
      if (on !== 1) throw new ApiError(403, 'mcp_disabled');
      await next();
    })
    .get('/', (c) => {
      // No server-to-client stream: everything is answered in the POST.
      c.header('Allow', 'POST');
      return c.body(null, 405);
    })
    .post('/', async (c) => {
      let body: unknown;
      try {
        body = JSON.parse(await c.req.text());
      } catch {
        return c.json(rpcError(null, PARSE_ERROR, 'Parse error'), 400);
      }
      const userId = c.var.user!.id;
      if (!Array.isArray(body)) {
        const res = handle(userId, body);
        return res ? c.json(res) : c.body(null, 202);
      }
      if (!body.length)
        return c.json(rpcError(null, INVALID_REQUEST, 'Empty batch'), 400);
      const res = body.map((m) => handle(userId, m)).filter((r) => r);
      return res.length ? c.json(res) : c.body(null, 202);
    });
}
