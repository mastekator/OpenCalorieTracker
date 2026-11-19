import { useState } from 'react';
import {
  fromPer100,
  per100,
  recipeBasisG,
  recipeTotals,
  servingG,
  type Nutrients,
  type Recipe,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Segment } from '../Segment/Segment';
import '../MacroStat/MacroStat.css';
import './NutritionCard.css';

type Basis = 'portion' | 'per100' | 'whole';
type Props = Pick<Recipe, 'cookedG' | 'servings' | 'ingredients'>;

/** What the card shows for a basis: nutrients and the grams they are for. All maths from shared (ADR-0023 §2). */
export function nutritionFor(recipe: Props, basis: Basis) {
  const p100 = per100(recipe);
  const serving = servingG(recipe);
  if (basis === 'portion' && serving !== null)
    return { n: fromPer100(p100, serving), g: serving };
  if (basis === 'whole') {
    const { kcal, proteinG, fatG, carbsG } = recipeTotals(recipe.ingredients);
    const n: Nutrients = { kcal, proteinG, fatG, carbsG };
    return { n, g: recipeBasisG(recipe) };
  }
  return { n: p100, g: 100 };
}

/** Recipe nutrition (OCT-160 2.1): Serving / 100 g / Whole; without servings 100 g, no Serving option. */
export function NutritionCard(recipe: Props) {
  const { t, num } = useT();
  const hasServings = servingG(recipe) !== null;
  const [basis, setBasis] = useState<Basis>(hasServings ? 'portion' : 'per100');
  const shown = !hasServings && basis === 'portion' ? 'per100' : basis;
  const { n, g } = nutritionFor(recipe, shown);
  const grams = (v: number) => `${num(v)}\u00a0${t('macro.g')}`;
  const options = [
    ...(hasServings
      ? [{ value: 'portion' as const, label: t('recipe.nut.portion') }]
      : []),
    { value: 'per100' as const, label: t('recipe.nut.per100') },
    { value: 'whole' as const, label: t('recipe.nut.whole') },
  ];
  return (
    <section className="nutrition-card" aria-label={t('recipe.nut.label')}>
      <Segment
        label={t('recipe.nut.label')}
        options={options}
        value={shown}
        onChange={setBasis}
      />
      {/* Announced on a switch, so the radio change has a spoken result. */}
      <div aria-live="polite">
        <p className="nutrition-card__kcal">
          <span className="nutrition-card__value">{num(n.kcal)}</span>{' '}
          {t(`recipe.nut.kcal_${shown}`, { g: num(g) })}
        </p>
        <p className="nutrition-card__macros">
          {(
            [
              ['p', 'protein', n.proteinG],
              ['f', 'fat', n.fatG],
              ['c', 'carbs', n.carbsG],
            ] as const
          ).map(([k, m, v]) => (
            <span key={k}>
              <i className={`macro__dot macro__dot--${m}`} aria-hidden="true" />
              {t(`recipe.nut.${k}`, { g: grams(v) })}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
