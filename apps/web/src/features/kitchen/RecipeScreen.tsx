import { useState } from 'react';
import { Ellipsis, Play } from 'lucide-react';
import { Link, Redirect, useLocation } from 'wouter';
import { matchIllustration, servingG, type Recipe } from '@oct/shared';
import { deleteRecipe, useDb, useRecipe } from '../../data/DataContext';
import { thumbUrl } from '../../data/thumbs';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { DishIllustration } from '../../ui/DishIllustration/DishIllustration';
import { List, ListRow } from '../../ui/List/List';
import { NavBar } from '../../ui/NavBar/NavBar';
import { NutritionCard } from '../../ui/NutritionCard/NutritionCard';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useToast } from '../../ui/Toast/Toast';
import { useToday } from '../diary/useToday';
import { useWeightFormat } from '../weight/format';
import './RecipeScreen.css';

/** /kitchen/:id from the local copy; a recipe that is gone (deleted here or elsewhere) goes back to the list. */
export function RecipeScreen({ id }: { id: string }) {
  const db = useDb();
  const recipe = useRecipe(Number(id));
  const online = useOnline();
  const today = useToday();
  const [, navigate] = useLocation();
  const toast = useToast();
  const { t } = useT();
  if (recipe === null) return <Redirect to="/kitchen" replace />;
  if (!recipe) return null;
  return (
    <RecipeView
      recipe={recipe}
      today={today}
      online={online}
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
  onDelete: () => Promise<void>;
};

/** The recipe card (OCT-160 2.1, 2.2, 2.7); desktop: three columns (§10). */
export function RecipeView({ recipe, today, online, onDelete }: Props) {
  const { t, num } = useT();
  const { when } = useWeightFormat('metric');
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [brokenHero, setBrokenHero] = useState(false);
  const serving = servingG(recipe);
  const totalKcal = recipe.ingredients.reduce((s, i) => s + i.kcal, 0);
  const meta = [
    recipe.servings !== null &&
      serving !== null &&
      t('recipe.servings', { count: recipe.servings, g: num(serving) }),
    recipe.cookedG !== null && t('recipe.cooked', { w: num(recipe.cookedG) }),
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
          <h2 className="recipe__name">{recipe.name}</h2>
          {meta && <p className="recipe__meta">{meta}</p>}
        </header>
        <div className="recipe__nutrition">
          <NutritionCard {...recipe} />
        </div>
        {recipe.steps.length > 0 && (
          <div className="recipe__actions">
            <Link
              href={`/kitchen/${recipe.id}/cook`}
              className="button button--tonal"
            >
              <Play aria-hidden="true" />
              {t('recipe.cooking')}
            </Link>
          </div>
        )}
        <div className="recipe__ingredients">
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
                value={`${num(i.grams)}\u00a0${t('macro.g')}`}
              >
                {i.name}
              </ListRow>
            ))}
          </List>
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
                      {s.photoId && (
                        <img
                          className="recipe__step-photo"
                          src={thumbUrl(s.photoId)}
                          alt=""
                          loading="lazy"
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
