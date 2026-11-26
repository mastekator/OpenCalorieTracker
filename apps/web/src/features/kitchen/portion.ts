import {
  entryDay,
  uuid,
  type MealInput,
  type MealItemInput,
  type MealType,
} from '@oct/shared';
import type { Db } from '../../data/db';
import { createMeal } from '../../data/outbox';

/** A new meal of one recipe portion eaten at `at`, as the edit screen builds it. */
export function portionMeal(
  item: MealItemInput,
  mealType: MealType,
  at: Date,
): MealInput {
  // East-positive, the offset at that moment (DST).
  const tzOffsetMin = -at.getTimezoneOffset();
  return {
    clientId: uuid(),
    eatenAt: at.toISOString(),
    tzOffsetMin,
    localDate: entryDay(at, tzOffsetMin, 'today'),
    mealType,
    items: [item],
  };
}

/** «Log to dinner» from the recipe card or «Done!»: through the outbox, so it works offline. */
export const logPortion = (
  db: Db,
  item: MealItemInput,
  when: { mealType: MealType; at: Date },
) =>
  createMeal(db, {
    ...portionMeal(item, when.mealType, when.at),
    // The tap; the queue sends this very value later (ADR-0032 §2).
    loggedAt: new Date().toISOString(),
  });
