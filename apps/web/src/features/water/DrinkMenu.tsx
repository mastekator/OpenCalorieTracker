import { useLayoutEffect, type KeyboardEvent } from 'react';
import { ChevronRight, EyeOff, Pencil } from 'lucide-react';
import { entryFrom, type Units } from '@oct/shared';
import { useT } from '../../i18n';
import { DishIllustration } from '../../ui/DishIllustration/DishIllustration';
import { useModalDialog } from '../../ui/useModalDialog';
import { useVolume } from './format';
import type { DrinkTileInfo } from './WaterCard';
import './DrinkMenu.css';

/** The two amounts the menu offers (OCT-147 1.2). */
export const MENU_ML = [250, 500] as const;
/** Gap between the tile and the menu, and the menu and the screen edge. */
const GAP_PX = 8;

/** `hiddenDrinks` takes built-ins only, and water always stays (ADR-0028 §5). */
export const hideable = (key: string) =>
  key !== 'water' && !key.startsWith('custom:');

type Props = {
  /** The drink whose tile was held; null keeps the menu closed. */
  drink: DrinkTileInfo | null;
  /** The tile: the menu opens under it, or above when there is no room. */
  anchor: HTMLElement | null;
  units: Units;
  onClose: () => void;
  onPick: (ml: number) => void;
  onOther: () => void;
  onHide: () => void;
  /** «Edit drink»: own drinks only. */
  onEdit: () => void;
};

/** OCT-147 1.2: the amount menu of a drink tile, over a scrim; the tile is lifted above it. */
export function DrinkMenu({
  drink,
  anchor,
  units,
  onClose,
  onPick,
  onOther,
  onHide,
  onEdit,
}: Props) {
  const { t, num } = useT();
  const volume = useVolume(units);
  const open = drink !== null;
  const { ref, onKeyDown, onCancel } = useModalDialog(open, onClose);

  // Placed after showModal (an earlier layout effect), when the menu has its height.
  useLayoutEffect(() => {
    const dialog = ref.current;
    const menu = dialog?.querySelector<HTMLElement>('.drink-menu__list');
    const lift = dialog?.querySelector<HTMLElement>('.drink-menu__tile');
    if (!open || !anchor || !menu || !lift) return;
    const r = anchor.getBoundingClientRect();
    Object.assign(lift.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
    });
    const h = menu.offsetHeight;
    const below = r.bottom + GAP_PX;
    const top =
      below + h <= innerHeight - GAP_PX
        ? below
        : Math.max(GAP_PX, r.top - GAP_PX - h);
    const left = Math.min(
      Math.max(GAP_PX, r.left),
      innerWidth - menu.offsetWidth - GAP_PX,
    );
    Object.assign(menu.style, { top: `${top}px`, left: `${left}px` });
  }, [open, anchor, ref]);

  const choose = (action: () => void) => {
    onClose();
    action();
  };

  // Arrows, Home and End move between the items, as in a native menu.
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]'),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to = {
      ArrowDown: (at + 1) % items.length,
      ArrowUp: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    items[to]?.focus();
  };

  const kcal = (ml: number) => (drink ? entryFrom(drink, ml).kcal : 0);

  return (
    <dialog
      ref={ref}
      className="drink-menu"
      aria-label={drink ? t('water.menu', { name: drink.name }) : undefined}
      onKeyDown={onKeyDown}
      onCancel={onCancel}
      // The dialog fills the screen: a click on it, not on the menu, is the scrim.
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      {drink && (
        <>
          <span className="drink-menu__tile" aria-hidden="true">
            <DishIllustration
              id={drink.illustration}
              size="var(--drink-tile-size)"
            />
            <span className="drink-tile__name">{drink.name}</span>
          </span>
          <div className="drink-menu__list" role="menu" onKeyDown={move}>
            <p className="drink-menu__head">
              {t('water.per100', {
                name: drink.name,
                kcal: num(drink.per100.kcal),
              })}
            </p>
            {MENU_ML.map((ml) => (
              <button
                key={ml}
                type="button"
                role="menuitem"
                className="drink-menu__item"
                onClick={() => choose(() => onPick(ml))}
              >
                {volume(ml)}
                {/* The space keeps «250 ml 113 kcal» apart in the item's name. */}
                {drink.per100.kcal > 0 && ' '}
                {drink.per100.kcal > 0 && (
                  <span className="drink-menu__kcal">
                    {t('meal.kcal', { n: num(Math.round(kcal(ml))) })}
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className="drink-menu__item"
              onClick={() => choose(onOther)}
            >
              {t('water.other_amount')}
              <Pencil aria-hidden="true" />
            </button>
            {drink.key.startsWith('custom:') ? (
              <>
                <div className="drink-menu__gap" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="drink-menu__item"
                  onClick={() => choose(onEdit)}
                >
                  {t('water.edit_drink')}
                  <ChevronRight aria-hidden="true" />
                </button>
              </>
            ) : (
              hideable(drink.key) && (
                <>
                  <div className="drink-menu__gap" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="drink-menu__item"
                    onClick={() => choose(onHide)}
                  >
                    {t('water.hide')}
                    <EyeOff aria-hidden="true" />
                  </button>
                </>
              )
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
