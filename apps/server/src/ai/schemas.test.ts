import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  ingredientsModelSchema,
  interviewTurnSchema,
  lighterModelSchema,
  packageModelSchema,
  recipeParseModelSchema,
  refineModelSchema,
} from '@oct/shared';
import { generateText, Output } from 'ai';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { failureNote, providerText } from './common.js';

/** The `responseJsonSchema` Gemini gets for a schema, and the error our call raises on a 400. */
async function geminiRequest(schema: z.ZodType) {
  let body: { generationConfig: { responseJsonSchema: unknown } } | undefined;
  const model = createGoogleGenerativeAI({
    apiKey: 'AIzaTestKeyTestKeyTestKey',
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          error: {
            code: 400,
            message: 'schema too complex ?key=AIzaTestKeyTestKeyTestKey',
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    },
  })('gemini-test');
  const err = await generateText({
    model,
    prompt: 'x',
    output: Output.object({ schema }),
    maxRetries: 0,
  }).catch((e: unknown) => e);
  return { jsonSchema: body!.generationConfig.responseJsonSchema, err };
}

interface Stats {
  optional: number;
  depth: number;
}

/** Optional object properties and nesting depth of a JSON schema. */
function stats(s: unknown, depth = 0): Stats {
  const out = { optional: 0, depth };
  if (!s || typeof s !== 'object') return out;
  const node = s as Record<string, unknown>;
  const props = (node.properties ?? {}) as Record<string, unknown>;
  const required = new Set((node.required ?? []) as string[]);
  out.optional += Object.keys(props).filter((k) => !required.has(k)).length;
  const children = [
    ...Object.values(props),
    node.items,
    ...((node.anyOf ?? []) as unknown[]),
  ];
  for (const c of children) {
    const sub = stats(c, depth + 1);
    out.optional += sub.optional;
    out.depth = Math.max(out.depth, sub.depth);
  }
  return out;
}

// Gemini answers 400 to a response schema with too many optional and nullable fields (OCT-437).
const schemas = {
  recognize: packageModelSchema,
  refine: refineModelSchema,
  parse: recipeParseModelSchema,
  lighter: lighterModelSchema,
  interview: interviewTurnSchema,
  ingredients: ingredientsModelSchema,
};

describe('model response schemas (OCT-437)', () => {
  it.each(Object.entries(schemas))(
    '%s: no optional fields, shallow and small',
    async (name, schema) => {
      const { jsonSchema } = await geminiRequest(schema);
      const { optional, depth } = stats(jsonSchema);
      expect(optional).toBe(0);
      expect(depth).toBeLessThanOrEqual(8);
      expect(JSON.stringify(jsonSchema).length).toBeLessThan(4000);
      // Any change to what the model is asked for shows up in the PR.
      expect(jsonSchema).toMatchSnapshot(name);
    },
  );

  it('parses a left-out field as null and an odd unit as null', () => {
    const dish = {
      name: 'Tea',
      grams: 200,
      kcal: 2,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      confidence: 1,
    };
    const parsed = packageModelSchema.parse({
      dishes: [
        { ...dish, unit: ' ML ' },
        { ...dish, unit: 'cup' },
      ],
    });
    expect(parsed.questions).toEqual([]);
    expect(parsed.dishes.map((d) => [d.unit, d.barcode, d.label])).toEqual([
      ['ml', null, null],
      [null, null, null],
    ]);
  });

  it('logs the provider text of a 400 without the key', async () => {
    const { err } = await geminiRequest(refineModelSchema);
    const note = failureNote(err);
    expect(note).toContain('status=400');
    expect(note).toContain('schema too complex');
    expect(note).not.toContain('AIza');
  });

  it('cuts the provider text to one short line', () => {
    expect(providerText(`a\n\n${'b'.repeat(400)}`)).toHaveLength(300);
    expect(providerText('Bearer abc.def x')).toBe('*** x');
  });
});
