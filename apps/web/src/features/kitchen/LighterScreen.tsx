import { useEffect, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { Redirect, useLocation } from 'wouter';
import { z } from 'zod';
import {
  lightened,
  lighterBasisKcal,
  lighterSaving,
  type LighterChangeLine,
  type LighterResponse,
  type LighterVariant,
  type Recipe,
  type RecipeInput,
  type Units,
} from '@oct/shared';
import { api } from '../../api/client';
import {
  isRecipeChanged,
  saveRecipe,
  useDb,
  useRecipe,
} from '../../data/DataContext';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { NavBar } from '../../ui/NavBar/NavBar';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { Delayed, Skeleton } from '../../ui/Skeleton/Skeleton';
import { useToast } from '../../ui/Toast/Toast';
import { useWeight } from '../../ui/weightUnits';
import { useUnits } from './units';
import './LighterScreen.css';

const responseSchema = z.custom<LighterResponse>((v) =>
  Array.isArray((v as LighterResponse | null)?.variants),
);

/** /kitchen/:id/lighter: asks the server once on open; saving goes through the editor's `saveRecipe`. */
export function LighterScreen({ id }: { id: string }) {
  const db = useDb();
  const recipe = useRecipe(Number(id));
  const online = useOnline();
  const [, navigate] = useLocation();
  const units = useUnits();
  if (recipe === null) return <Redirect to="/kitchen" replace />;
  if (!recipe) return null;
  return (
    <LighterView
      recipe={recipe}
      online={online}
      units={units}
      load={() =>
        api(`/api/ai/recipes/${recipe.id}/lighter`, responseSchema, {
          method: 'POST',
        })
      }
      onSave={(input, base) =>
        saveRecipe(db, input, base).catch((err: unknown) => {
          // Variants of an older version: back to the fresh card.
          if (isRecipeChanged(err))
            navigate(`/kitchen/${id}`, { replace: true });
          throw err;
        })
      }
      onSaved={(r) => navigate(`/kitchen/${r.id}`, { replace: true })}
    />
  );
}

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; variants: LighterVariant[] };

type Props = {
  recipe: Recipe;
  /** Offline the variants stay readable, saving is disabled (ADR-0023 §4). */
  online: boolean;
  /** Weights in grams or ounces (AC-2.6). */
  units?: Units;
  /** POST /api/ai/recipes/:id/lighter. */
  load: () => Promise<LighterResponse>;
  /** POST (no base) or PUT from `base`; throws on failure. */
  onSave: (
    input: RecipeInput,
    base?: Pick<Recipe, 'id' | 'updatedAt'>,
  ) => Promise<Recipe>;
  onSaved: (recipe: Recipe) => void;
};

/** «Make it lighter» (OCT-160 §9, frame 7.3; AC-9.1, 9.3, 9.4; E-10.6). */
export function LighterView({
  recipe,
  online,
  units,
  load,
  onSave,
  onSaved,
}: Props) {
  const { t, num } = useT();
  const w = useWeight(units);
  const toast = useToast();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  // The version the variants are built from, not a newer one synced in meanwhile.
  const [opened] = useState(recipe);
  // Only a retry asks again: `load` is a new function on every render.
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    load().then(
      (r) => live && setState({ status: 'done', variants: r.variants }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const perServing = recipe.servings !== null;
  const kcal = (k: number) => num(Math.round(k));
  const change = (c: LighterChangeLine) => {
    const src = c.from === null ? undefined : recipe.ingredients[c.from];
    return t(`lighter.change.${c.change}`, {
      name: c.name,
      from: src?.name ?? '',
      a: w.fmt(src?.grams ?? 0),
      b: w.fmt(c.grams),
      u: w.u,
    });
  };
  const save = async (v: LighterVariant, apply: boolean) => {
    const l = lightened(recipe, v);
    const input: RecipeInput = {
      name: apply
        ? recipe.name
        : t('lighter.name', { name: recipe.name }).slice(0, 80),
      cookedG: l.cookedG,
      servings: recipe.servings,
      note: recipe.note,
      // A copy can't reuse the original's photos: the server rejects a photo owned by another recipe.
      photoId: apply ? recipe.photoId : null,
      ingredients: l.ingredients,
      steps: apply
        ? recipe.steps
        : recipe.steps.map((s) => ({ ...s, photoId: null })),
      per100: null,
      servingG: null,
    };
    setSaving(true);
    try {
      onSaved(await onSave(input, apply ? opened : undefined));
    } catch (err) {
      toast({
        text: t(isRecipeChanged(err) ? 'editor.changed' : 'editor.save_error'),
      });
      setSaving(false);
    }
  };

  return (
    <div className="screen">
      <NavBar
        title={t('lighter.title')}
        back={{ href: `/kitchen/${recipe.id}`, label: t('lighter.back') }}
      />
      <main className="screen__body lighter">
        <p className="lighter__lead">
          {t(perServing ? 'lighter.lead' : 'lighter.lead_100', {
            k: kcal(lighterBasisKcal(recipe)),
          })}
        </p>
        {state.status === 'loading' && (
          <div role="status" className="lighter__busy">
            <p>{t('lighter.busy')}</p>
            <Delayed>
              <Skeleton height="var(--recipe-hero-height)" />
            </Delayed>
          </div>
        )}
        {state.status === 'error' && (
          <Banner
            tone="danger"
            title={t('lighter.error.title')}
            actions={
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                {t('common.retry')}
              </button>
            }
          >
            {t('lighter.error.body')}
          </Banner>
        )}
        {state.status === 'done' &&
          state.variants.map((v, i) => (
            <section
              key={i}
              className="lighter__card"
              aria-labelledby={`lighter-${i}`}
            >
              <h2 id={`lighter-${i}`} className="lighter__n">
                {t('lighter.variant', { i: i + 1, n: state.variants.length })}
              </h2>
              <p className="lighter__ba">
                <s className="lighter__was">{kcal(lighterBasisKcal(recipe))}</s>
                <ArrowRight aria-hidden="true" />
                <b>
                  {t('lighter.became', {
                    k: kcal(lighterBasisKcal(lightened(recipe, v))),
                  })}
                </b>
                <span className="lighter__delta">
                  {t(perServing ? 'lighter.delta' : 'lighter.delta_100', {
                    k: kcal(lighterSaving(recipe, v)),
                  })}
                </span>
              </p>
              <ul className="lighter__changes">
                {v.changes.map((c, n) => (
                  <li key={n}>
                    <b>{change(c)}</b>
                    {c.why && <span>{c.why}</span>}
                  </li>
                ))}
              </ul>
              <div className="lighter__actions">
                <Button
                  small
                  disabled={!online || saving}
                  onClick={() => void save(v, false)}
                >
                  {t('lighter.save_new')}
                </Button>
                <Button
                  small
                  variant="plain"
                  disabled={!online || saving}
                  onClick={() => void save(v, true)}
                >
                  {t('lighter.apply')}
                </Button>
              </div>
            </section>
          ))}
        <p className="lighter__sent">
          <Lock aria-hidden="true" />
          {t('lighter.sent')}
        </p>
      </main>
    </div>
  );
}
