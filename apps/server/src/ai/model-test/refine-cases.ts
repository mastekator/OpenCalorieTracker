import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { refineDishInSchema, refineModeSchema } from '@oct/shared';
import type { Refined } from '../refine.js';
import { readExpected, totalKcal } from './compare.js';

/** apps/server/test-refine: the refine prompt cases (ADR-0020 §10); a developer tool, not in the image. */
export const TEST_REFINE_DIR = new URL(
  '../../../test-refine/',
  import.meta.url,
);

const pattern = z.string().refine(
  (s) => {
    try {
      new RegExp(s, 'i');
      return true;
    } catch {
      return false;
    }
  },
  { message: 'not a valid regular expression' },
);
const range = z
  .tuple([z.number(), z.number()])
  .refine(([min, max]) => min <= max, { message: 'min > max' });

export const refineCaseSchema = z
  .object({
    name: z.string().min(1),
    mode: refineModeSchema,
    photo: z.string().optional(),
    text: z.string().max(300),
    locale: z.string().default('en'),
    dishes: z.array(refineDishInSchema),
    expect: z.object({
      dishes: z
        .array(
          z.object({
            name: pattern,
            grams: range.optional(),
            kcal: range.optional(),
          }),
        )
        .optional(),
      absent: z.array(pattern).optional(),
      kept: z.array(z.string()).optional(),
      question: pattern.optional(),
    }),
  })
  .refine((c) => c.mode === 'again' || c.text.trim().length > 0, {
    message: 'refine needs a text',
  });
export type RefineCase = z.infer<typeof refineCaseSchema>;

/** Parses cases.json; an error names the case. A photo must be one of the test photos. */
export function parseCases(json: unknown, photos: string[]): RefineCase[] {
  if (!Array.isArray(json)) throw new Error('cases.json: expected an array');
  return json.map((raw, i) => {
    const name = (raw as { name?: string })?.name ?? `#${i + 1}`;
    const parsed = refineCaseSchema.safeParse(raw);
    if (!parsed.success)
      throw new Error(`case ${name}: ${z.prettifyError(parsed.error)}`);
    const c = parsed.data;
    if (c.photo && !photos.includes(c.photo))
      throw new Error(`case ${name}: photo ${c.photo} is not in test-photos`);
    return c;
  });
}

export async function readCases(): Promise<RefineCase[]> {
  const json = JSON.parse(
    await readFile(new URL('cases.json', TEST_REFINE_DIR), 'utf8'),
  ) as unknown;
  return parseCases(
    json,
    (await readExpected()).map((e) => e.file),
  );
}

const re = (s: string) => new RegExp(s, 'i');
const within = (n: number, r?: [number, number]) =>
  !r || (n >= r[0] && n <= r[1]);

/** Why the answer misses the case, or null when it matches. */
export function checkCase(c: RefineCase, got: Refined): string | null {
  const { expect } = c;
  for (const e of expect.dishes ?? []) {
    const named = got.dishes.filter((d) => re(e.name).test(d.name));
    if (!named.length) return `no dish /${e.name}/`;
    if (!named.some((d) => within(d.grams, e.grams) && within(d.kcal, e.kcal)))
      return `/${e.name}/ out of range`;
  }
  for (const a of expect.absent ?? [])
    if (got.dishes.some((d) => re(a).test(d.name))) return `unexpected /${a}/`;
  for (const id of expect.kept ?? []) {
    const was = c.dishes.find((d) => d.id === id);
    const now = got.dishes.find((d) => d.ref === id);
    if (
      !was ||
      !now ||
      Math.abs(now.grams - was.grams) > 1 ||
      Math.abs(now.kcal - was.kcal) > 1
    )
      return `${id} not kept`;
  }
  if (
    expect.question &&
    !got.questions.some((q) =>
      re(expect.question!).test(got.dishes[q.dish]?.name ?? ''),
    )
  )
    return 'question';
  return null;
}

/** What the case expects, for the table: `rice 195-205 g; -soup; kept d1; ?salad`. */
export function expectedCaseText({ expect: e }: RefineCase) {
  return [
    ...(e.dishes ?? []).map((d) =>
      [
        d.name,
        d.grams && `${d.grams.join('-')} g`,
        d.kcal && `${d.kcal.join('-')} kcal`,
      ]
        .filter(Boolean)
        .join(' '),
    ),
    ...(e.absent ?? []).map((a) => `-${a}`),
    ...(e.kept ?? []).map((id) => `kept ${id}`),
    ...(e.question ? [`?${e.question}`] : []),
  ].join('; ');
}

/** One case's columns, from the answer. */
export function checkRefined(c: RefineCase, got: Refined) {
  return {
    got:
      got.dishes
        .map(
          (d) =>
            `${d.name} ${Math.round(d.grams)} g${d.ref ? ` (${d.ref})` : ''}`,
        )
        .join(', ') || '(none)',
    kcal: totalKcal(got),
    asked: got.questions.map((q) => got.dishes[q.dish]?.name).join(', '),
    result: checkCase(c, got) ?? 'ok',
  };
}
