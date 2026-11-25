import { useEffect, useState } from 'react';
import { Camera, History, Pencil } from 'lucide-react';
import { useT } from '../../i18n';
import type { HistoryDish } from '../../data/DataContext';
import { Field } from '../Field/Field';
import { List, ListRow } from '../List/List';
import { Sheet } from '../Sheet/Sheet';
import './IngredientPickerSheet.css';

type Props = {
  /** Dishes from the diary matching the query (findHistoryDishes). */
  search: (query: string) => Promise<HistoryDish[]>;
  onPick: (dish: HistoryDish) => void;
  /** «Enter “…” manually»: the typed text becomes the name. */
  onManual: (query: string) => void;
  /** «Photograph the ingredients» (ADR-0040 §6); none: no AI recognition, no row. Offline: greyed out. */
  photo?: { online: boolean; onPick: () => void };
  onClose: () => void;
};

/**
 * «+ Ingredient» (OCT-160 2.5): search the history, or enter by hand. Wave 1: no
 * «From fridge» group. The editor mounts it while open.
 */
export function IngredientPickerSheet({
  search,
  onPick,
  onManual,
  photo,
  onClose,
}: Props) {
  const { t, num, locale } = useT();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<HistoryDish[]>([]);
  const q = query.trim();
  useEffect(() => {
    let live = true;
    if (!q) setFound([]);
    else
      void search(q).then(
        (r) => live && setFound(r),
        () => {},
      );
    return () => {
      live = false;
    };
  }, [q, search]);

  return (
    <Sheet open onClose={onClose} title={t('editor.ingredient')}>
      <div className="ingredient-picker">
        <Field
          label={t('editor.search')}
          type="search"
          autoComplete="off"
          maxLength={80}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {found.length > 0 && (
          <List
            title={
              <span className="ingredient-picker__group">
                <History aria-hidden="true" />
                {t('editor.from_history')}
              </span>
            }
          >
            {found.map((d) => (
              <ListRow
                key={d.name}
                description={t('editor.history_sub', {
                  k: num((d.kcal / d.grams) * 100),
                  date: new Date(d.eatenAt).toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'short',
                  }),
                })}
                onClick={() => onPick(d)}
              >
                {d.name}
              </ListRow>
            ))}
          </List>
        )}
        <List footer={t('editor.picker_note')}>
          {photo && (
            <ListRow
              accent={photo.online}
              disabled={!photo.online}
              icon={<Camera />}
              description={t(
                photo.online ? 'editor.photo_row_sub' : 'editor.photo_offline',
              )}
              // A disabled row still takes the tap (ListRow keeps it for toasts); offline it does nothing.
              onClick={() => photo.online && photo.onPick()}
            >
              {t('editor.photo_row')}
            </ListRow>
          )}
          <ListRow accent icon={<Pencil />} onClick={() => onManual(q)}>
            {q ? t('editor.enter_manually', { q }) : t('recipes.manual')}
          </ListRow>
        </List>
      </div>
    </Sheet>
  );
}
