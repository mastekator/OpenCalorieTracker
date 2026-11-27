import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  BUILTIN_DRINKS,
  type AccountSettingsPatch,
  type Drink,
} from '@oct/shared';
import {
  deleteDrink,
  saveDrink,
  useCustomDrinks,
  useDb,
  useSettings,
} from '../../data/DataContext';
import { patchSettings } from '../../data/outbox';
import { useT } from '../../i18n';
import { DishIllustration } from '../../ui/DishIllustration/DishIllustration';
import { List, ListRow } from '../../ui/List/List';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { useToast } from '../../ui/Toast/Toast';
import { Switch } from '../../ui/Switch/Switch';
import { useUndoDelete } from '../diary/undoDelete';
import { CustomDrinkSheet } from '../water/CustomDrinkSheet';
import './settings.css';

export const DRINKS_PATH = '/settings/drinks';

type Hidden = NonNullable<AccountSettingsPatch['hiddenDrinks']>;

/** OCT-147 3.3: own drinks to open and change, built-ins switched in or out of the row. */
export function DrinksScreen() {
  const { t, num } = useT();
  const db = useDb();
  const online = useOnline();
  const settings = useSettings();
  const toast = useToast();
  const { hidden: deleting, hide } = useUndoDelete();
  const own = useCustomDrinks()
    ?.filter((d) => !deleting.has(`custom:${d.id}`))
    .sort((a, b) => a.id - b.id);
  // undefined: closed; null: a new drink.
  const [open, setOpen] = useState<Drink | null | undefined>();
  const addRow = useRef<HTMLDivElement>(null);
  if (!settings || !own) return null;
  const hiddenDrinks = (settings.hiddenDrinks ?? []) as Hidden;

  const per100 = (kcal: number) =>
    kcal ? t('drink_list.per100', { kcal: num(kcal) }) : t('drink_list.zero');

  const remove = (d: Drink) => {
    setOpen(undefined);
    // The id and the row place stay while «Undo» is offered; the DELETE goes after it.
    hide(`custom:${d.id}`, t('drink_list.deleted', { name: d.name }), () =>
      // The undo window swallows errors: say so, the drink is back after a reload.
      deleteDrink(db, d.id).catch(() =>
        toast({ text: t('drink_list.delete_error') }),
      ),
    );
    // The row that opened the sheet is gone: put focus on «Your drink» after the sheet returns it.
    requestAnimationFrame(() =>
      addRow.current?.querySelector<HTMLElement>('.list-row--accent')?.focus(),
    );
  };

  return (
    <div className="settings drinks-screen">
      <div ref={addRow}>
        <List title={t('drink_list.own')}>
          {own.map((d) => (
            <ListRow
              key={d.id}
              icon={<DishIllustration id={d.illustration} size="100%" />}
              description={
                d.countsWater
                  ? per100(d.kcal)
                  : `${per100(d.kcal)} · ${t('water.not_water')}`
              }
              onClick={() => setOpen(d)}
            >
              {d.name}
            </ListRow>
          ))}
          <ListRow
            accent
            chevron={false}
            icon={<Plus aria-hidden="true" />}
            onClick={() => setOpen(null)}
          >
            {t('drink_list.add')}
          </ListRow>
        </List>
      </div>
      <List title={t('drink_list.builtin')} footer={t('drink_list.footer')}>
        {BUILTIN_DRINKS.map((d) => {
          const water = d.key === 'water';
          const name = t(`drinks.${d.key}`);
          return (
            <ListRow
              key={d.key}
              icon={<DishIllustration id={d.illustration} size="100%" />}
              description={
                water ? t('drink_list.always_first') : per100(d.per100.kcal)
              }
              value={
                <Switch
                  checked={water || !hiddenDrinks.includes(d.key)}
                  disabled={water}
                  label={name}
                  // Queued like any setting: works offline.
                  onChange={(on) =>
                    void patchSettings(db, {
                      hiddenDrinks: on
                        ? hiddenDrinks.filter((k) => k !== d.key)
                        : [...hiddenDrinks, d.key as Hidden[number]],
                    })
                  }
                />
              }
            >
              {name}
            </ListRow>
          );
        })}
      </List>
      {open !== undefined && (
        <CustomDrinkSheet
          drink={open ?? undefined}
          online={online}
          onSave={async (input) => {
            await saveDrink(db, input, open?.id);
            setOpen(undefined);
          }}
          onDelete={open ? () => remove(open) : undefined}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}
