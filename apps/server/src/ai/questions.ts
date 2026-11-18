import {
  questionMatters,
  type AiQuestion,
  type RecognizedDish,
} from '@oct/shared';
import { sanitizeDish } from './recognize.js';

/** Prompt rules for AI questions, shared by recognition and refining (ADR-0020 §4). */
export const QUESTIONS_PROMPT = `Questions: when you are unsure about something that changes a dish's kcal noticeably (by 15 % or 50 kcal or more) and the photo or text cannot tell, ask about it in "questions":
- at most 3 questions, each about one dish: "dish" is its index in "dishes";
- the question is at most 60 characters, each option label at most 25, in the same language as the dish names;
- 2 to 4 options; each option carries the full dish values for the same portion (name, grams, kcal, protein, fat, carbohydrates);
- "guess" is the index of the option that matches the dish as you listed it;
- never ask about dishes the user set; if nothing is unclear, return an empty list.`;

const MAX_QUESTIONS = 3;
const MAX_OPTIONS = 4;

/** Cuts to `max` characters (code points), trimmed. */
const cut = (s: string, max: number) =>
  Array.from(s.trim()).slice(0, max).join('').trim();

/**
 * Drops questions the client cannot show (AC-10.10) instead of failing the answer: a dish out of the
 * list or set by the user, fewer than 2 options, a guess out of the options, no option that matters.
 * Cuts lengths and keeps at most 3; option numbers go through `sanitizeDish`.
 */
export function sanitizeQuestions(
  questions: AiQuestion[] | undefined,
  dishes: RecognizedDish[],
  isFixed: (dish: RecognizedDish) => boolean = () => false,
): AiQuestion[] {
  const result: AiQuestion[] = [];
  for (const q of questions ?? []) {
    const dish = dishes[q.dish];
    if (!Number.isInteger(q.dish) || !dish || isFixed(dish)) continue;
    const text = cut(q.text, 60);
    const options = q.options.slice(0, MAX_OPTIONS).map((o) => {
      const s = sanitizeDish({ ...o, confidence: 1 });
      return {
        label: cut(o.label, 25),
        name: cut(o.name, 80),
        grams: s.grams,
        kcal: s.kcal,
        proteinG: s.proteinG,
        fatG: s.fatG,
        carbsG: s.carbsG,
      };
    });
    if (
      !text ||
      options.length < 2 ||
      options.some((o) => !o.label || !o.name) ||
      !Number.isInteger(q.guess) ||
      !options[q.guess] ||
      !options.some((o) => questionMatters(dish, o))
    )
      continue;
    result.push({ dish: q.dish, text, guess: q.guess, options });
    if (result.length === MAX_QUESTIONS) break;
  }
  return result;
}
