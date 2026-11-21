import { useEffect, useRef, useState } from 'react';
import { BookOpen, Ellipsis, Feather, Play, Plus } from 'lucide-react';
import { Link, Redirect, useLocation } from 'wouter';
import {
  matchIllustration,
  recipeTotals,
  servingG,
  type MealItemInput,
  type MealType,
  type Recipe,
  type Units,
} from '@oct/shared';
import {
  deleteRecipe,
  useAiStatus,
  useDb,
  useRecipe,
} from '../../data/DataContext';
import { thumbUrl } from '../../data/thumbs';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { DishIllustration } from '../../ui/DishIllustration/DishIllustration';
import { List, ListRow } from '../../ui/List/List';
import { NavBar } from '../../ui/NavBar/NavBar';
import { NutritionCard } from '../../ui/NutritionCard/NutritionCard';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { PortionSheet } from '../../ui/PortionSheet/PortionSheet';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useToast } from '../../ui/Toast/Toast';
import { useToday } from '../diary/useToday';
import { useWeightFormat } from '../weight/format';
import { useWeight } from '../../ui/weightUnits';
import { logPortion } from './portion';
import type { RecipeEditorState } from './RecipeEditor';
import { useUnits } from './units';
import './RecipeScreen.css';

/** /kitchen/:id from the local copy; a recipe that is gone (deleted here or elsewhere) goes back to the list. */
export function RecipeScreen({ id }: { id: string }) {
  const db = useDb();
  const recipe = useRecipe(Number(id));
  const online = useOnline();
  const ai = useAiStatus();
  const today = useToday();
  const [, navigate] = useLocation();
  const toast = useToast();
  const { t } = useT();
  const units = useUnits();
  if (recipe === null) return <Redirect to="/kitchen" replace />;
  if (!recipe) return null;
  return (
    <RecipeView
      recipe={recipe}
      units={units}
      today={today}
      online={online}
      lighter={
        online && !!ai.status && ai.status.recognition !== 'not_configured'
      }
      onLog={(item, when) => logPortion(db, item, when)}
      onDelete={async () => {
        try {
          await deleteRecipe(db, recipe.id);
          navigate('/kitchen', { replace: true });
        } catch {
          toast({ text: t('recipe.delete.error') });
        }
      }}
    />
  );
}

type Props = {
  recipe: Recipe;
  /** `YYYY-MM-DD`, for «logged yesterday». */
  today: string;
  /** Offline the recipe is read-only: delete is disabled, the offline bar says why (OCT-25). */
  online: boolean;
  /** Weights in grams or ounces (AC-2.6). */
  units?: Units;
  /** «Make it lighter» entries: AI is set up and online (OCT-160 §9). */
  lighter: boolean;
  onDelete: () => Promise<void>;
  /** «Log to {meal}»: a new meal through the outbox, so it works offline. */
  onLog: (
    item: MealItemInput,
    when: { mealType: MealType; at: Date },
  ) => Promise<void>;
};

/** The recipe card (OCT-160 2.1, 2.2, 2.7); desktop: three columns (§10). */
export function RecipeView({
  recipe,
  today,
  online,
  units,
  lighter,
  onDelete,
  onLog,
}: Props) {
  const { t, num } = useT();
  const w = useWeight(units);
  const { u } = w;
  const [, navigate] = useLocation();
  const toast = useToast();
  const [portion, setPortion] = useState(false);
  const { when } = useWeightFormat('metric');
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [brokenHero, setBrokenHero] = useState(false);
  const [brokenSteps, setBrokenSteps] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const nameRef = useRef<HTMLHeadingElement>(null);
  // 2.2: the navbar shows the name only once the page title is scrolled under it.
  const [nameUnder, setNameUnder] = useState(false);
  useEffect(() => {
    const el = nameRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const bar = el.closest('.screen')?.querySelector('.navbar');
    const top = Math.round(bar?.getBoundingClientRect().bottom ?? 0);
    const io = new IntersectionObserver(
      ([e]) =>
        setNameUnder(
          !e!.isIntersecting &&
            e!.boundingClientRect.top < (e!.rootBounds?.top ?? 0),
        ),
      { rootMargin: `-${top}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const serving = servingG(recipe);
  const totalKcal = recipeTotals(recipe.ingredients).kcal;
  const meta = [
    recipe.servings !== null &&
      serving !== null &&
      t('recipe.servings', {
        count: recipe.servings,
        g: w.fmt(serving),
        u,
      }),
    recipe.per100 &&
      serving !== null &&
      t('recipe.serving', { g: w.fmt(serving), u }),
    recipe.cookedG !== null &&
      t('recipe.cooked', { w: w.fmt(recipe.cookedG), u }),
    recipe.lastLoggedAt &&
      t('recipe.logged', {
        when: when(
          new Date(recipe.lastLoggedAt).toLocaleDateString('sv'),
          today,
        ),
      }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="screen screen--wide">
      <NavBar
        title={recipe.name}
        titleHidden={!nameUnder}
        back={{ href: '/kitchen', label: t('kitchen.title') }}
        action={{
          icon: Ellipsis,
          label: t('recipe.more'),
          onClick: () => setMenu(true),
        }}
      />
      <main className="screen__body recipe">
        <div className="recipe__hero">
          {recipe.photoId && !brokenHero ? (
            <img
              className="recipe__photo"
              src={thumbUrl(recipe.photoId)}
              alt={recipe.name}
              onError={() => setBrokenHero(true)}
            />
          ) : (
            <DishIllustration
              id={matchIllustration(recipe.name)}
              size="calc(var(--recipe-hero-height) * 0.8)"
            />
          )}
        </div>
        <header className="recipe__head">
          <h2 ref={nameRef} className="recipe__name">
            {recipe.name}
          </h2>
          {meta && <p className="recipe__meta">{meta}</p>}
        </header>
        <div className="recipe__nutrition">
          <NutritionCard {...recipe} units={units} />
        </div>
        <div className="recipe__actions">
          <Button onClick={() => setPortion(true)}>{t('recipe.log')}</Button>
          {recipe.steps.length > 0 && (
            <Link
              href={`/kitchen/${recipe.id}/cook`}
              className="button button--tonal"
            >
              <Play aria-hidden="true" />
              {t('recipe.cooking')}
            </Link>
          )}
        </div>
        {lighter && (
          <div className="recipe__lighter">
            <List>
              {/* AC-1.6: nothing to swap without ingredients; the reason is in the row, no tooltip on a phone. */}
              <ListRow
                icon={<Feather aria-hidden="true" />}
                description={
                  recipe.per100 ? t('lighter.no_ingredients') : t('lighter.sub')
                }
                disabled={!!recipe.per100}
                href={
                  recipe.per100 ? undefined : `/kitchen/${recipe.id}/lighter`
                }
              >
                {t('lighter.title')}
              </ListRow>
            </List>
          </div>
        )}
        <div className="recipe__ingredients">
          {recipe.per100 ? (
            <List>
              <ListRow
                icon={<BookOpen aria-hidden="true" />}
                description={t('recipe.no_ingredients.body', {
                  k: num(recipe.per100.kcal),
                  p: num(recipe.per100.proteinG),
                  f: num(recipe.per100.fatG),
                  c: num(recipe.per100.carbsG),
                })}
              >
                {t('recipe.no_ingredients.title')}
              </ListRow>
              <ListRow
                accent
                icon={<Plus aria-hidden="true" />}
                onClick={() =>
                  navigate(`/kitchen/${recipe.id}/edit`, {
                    state: { compose: true } satisfies RecipeEditorState,
                  })
                }
              >
                {t('recipe.no_ingredients.add')}
              </ListRow>
            </List>
          ) : (
            <List
              title={
                <span className="recipe__group">
                  <span>
                    {t('recipe.ingredients', { n: recipe.ingredients.length })}
                  </span>
                  <span>{t('meal.kcal', { n: num(totalKcal) })}</span>
                </span>
              }
            >
              {recipe.ingredients.map((i, n) => (
                <ListRow
                  key={n}
                  description={
                    i.grams === 0
                      ? t('recipe.zero_kcal')
                      : t('meal.kcal', { n: num(i.kcal) })
                  }
                  value={w.as(i.unit).text(i.grams)}
                >
                  {i.name}
                </ListRow>
              ))}
            </List>
          )}
        </div>
        {recipe.steps.length > 0 && (
          <div className="recipe__steps">
            <List title={t('recipe.steps', { n: recipe.steps.length })}>
              {recipe.steps.map((s, i) => (
                <li key={i} className="list__item">
                  <div className="list-row recipe__step">
                    <span
                      className="recipe__step-n"
                      aria-label={t('recipe.step', { i: i + 1 })}
                    >
                      {i + 1}
                    </span>
                    <div className="recipe__step-body">
                      <p>{s.text}</p>
                      {s.photoId && !brokenSteps.has(i) && (
                        <img
                          className="recipe__step-photo"
                          src={thumbUrl(s.photoId)}
                          alt=""
                          loading="lazy"
                          // A photo that is gone or offline is left out: the step text is enough.
                          onError={() =>
                            setBrokenSteps((b) => new Set(b).add(i))
                          }
                        />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </List>
          </div>
        )}
      </main>
      <Sheet
        open={menu}
        title={recipe.name}
        onClose={() => setMenu(false)}
        footer={
          <>
            <Button
              variant="plain"
              onClick={() => {
                setMenu(false);
                navigate(`/kitchen/${recipe.id}/edit`);
              }}
            >
              {t('recipe.edit')}
            </Button>
            {lighter && !recipe.per100 && (
              <Button
                variant="plain"
                onClick={() => {
                  setMenu(false);
                  navigate(`/kitchen/${recipe.id}/lighter`);
                }}
              >
                {t('lighter.title')}
              </Button>
            )}
            <Button
              variant="danger-plain"
              disabled={!online}
              onClick={() => {
                setMenu(false);
                setConfirm(true);
              }}
            >
              {t('recipe.delete.action')}
            </Button>
            <Button variant="plain" onClick={() => setMenu(false)}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        {null}
      </Sheet>
      {portion && (
        <PortionSheet
          open
          recipe={recipe}
          units={units}
          log
          onClose={() => setPortion(false)}
          onAdd={(item, when) => {
            if (!when) return; // `log` always passes the meal and time
            void onLog(item, when).then(
              () => {
                setPortion(false);
                toast({
                  text: t('portion.logged', {
                    name: item.name,
                    w: `${w.fmt(item.grams)}\u00a0${u}`,
                  }),
                });
              },
              () => toast({ text: t('portion.error') }),
            );
          }}
        />
      )}
      <ConfirmDialog
        open={confirm}
        title={t('recipe.delete.title', { name: recipe.name })}
        body={t('recipe.delete.body')}
        confirmLabel={t('recipe.delete.ok')}
        onConfirm={() => {
          setConfirm(false);
          void onDelete();
        }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
