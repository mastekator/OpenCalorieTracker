import { useState } from 'react';
import { ClipboardPaste, Pencil, Plus } from 'lucide-react';
import { useLocation } from 'wouter';
import type { Recipe } from '@oct/shared';
import { useAiStatus, useRecipes } from '../../data/DataContext';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { DishIllustration } from '../../ui/DishIllustration/DishIllustration';
import { List, ListRow } from '../../ui/List/List';
import { NavBar } from '../../ui/NavBar/NavBar';
import { RecipeRow } from '../../ui/RecipeRow/RecipeRow';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Sheet } from '../../ui/Sheet/Sheet';

export const NEW_RECIPE_PATH = '/kitchen/new';
export const PASTE_PATH = '/kitchen/paste';

/** /kitchen: recipes from the local copy, works offline (ADR-0023 §4). */
export function KitchenScreen() {
  const ai = useAiStatus();
  return (
    <KitchenView
      recipes={useRecipes()}
      ai={!!ai.status && ai.status.recognition !== 'not_configured'}
    />
  );
}

/**
 * The recipe list (OCT-160 1.2, 1.4), recently logged first. Wave 1: no fridge, no filter;
 * «+» offers «Enter manually» and, with AI set up, «Paste recipe text».
 */
export function KitchenView({
  recipes,
  ai = false,
}: {
  recipes: Recipe[] | undefined;
  /** An AI provider is set up: the AI ways to add a recipe (OCT-160 §9). */
  ai?: boolean;
}) {
  const { t } = useT();
  const [, navigate] = useLocation();
  const [add, setAdd] = useState(false);
  return (
    <div className="screen screen--wide">
      {/* No tab: a row in the profile; on desktop a sidebar item (OCT-160 §1). */}
      <NavBar
        large
        title={t('kitchen.title')}
        back={{ href: '/profile', label: t('nav.profile'), mobileOnly: true }}
        action={{
          icon: Plus,
          label: t('recipes.add'),
          onClick: () => setAdd(true),
        }}
      />
      <main className="screen__body">
        {recipes && !recipes.length && (
          <ScreenState
            icon={
              <DishIllustration
                id="soup"
                size="calc(var(--space-12) + var(--space-2))"
              />
            }
            title={t('recipes.empty.title')}
            action={
              <Button onClick={() => navigate(NEW_RECIPE_PATH)}>
                {t('recipes.new')}
              </Button>
            }
          >
            {t('recipes.empty.body')}
          </ScreenState>
        )}
        {!!recipes?.length && (
          <List footer={t('recipes.sort_note')}>
            {recipes.map((r) => (
              <RecipeRow key={r.id} recipe={r} href={`/kitchen/${r.id}`} />
            ))}
          </List>
        )}
      </main>
      <Sheet open={add} title={t('recipes.add')} onClose={() => setAdd(false)}>
        <List>
          <ListRow icon={<Pencil />} href={NEW_RECIPE_PATH}>
            {t('recipes.manual')}
          </ListRow>
          {ai && (
            <ListRow icon={<ClipboardPaste />} href={PASTE_PATH}>
              {t('recipes.paste')}
            </ListRow>
          )}
        </List>
      </Sheet>
    </div>
  );
}
