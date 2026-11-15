import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Camera, Check, Image, Upload } from 'lucide-react';
import { ILLUSTRATION_IDS, type IllustrationId } from '@oct/shared';
import { useT } from '../../i18n';
import { DESKTOP_MEDIA } from '../../styles/breakpoints';
import { Button } from '../Button/Button';
import {
  DishIllustration,
  illustrationLabel,
} from '../DishIllustration/DishIllustration';
import { Sheet } from '../Sheet/Sheet';
import './IllustrationPicker.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The dish name, in the subtitle. */
  name: string;
  current: IllustrationId;
  /** Picked by hand (on the dish or for its name): «Restore automatic» shows (AC-4.7). */
  manual: boolean;
  /** One tap applies; the screen closes the sheet (AC-4.2). */
  onPick: (id: IllustrationId) => void;
  onReset: () => void;
  /** Photo actions; none when the meal already has a photo (AC-4.3). */
  onCamera?: () => void;
  onGallery?: () => void;
};

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

/** «Dish picture» (OCT-33 4.1, D.1): photo actions on top, then every illustration. */
export function IllustrationPicker({
  open,
  onClose,
  name,
  current,
  manual,
  onPick,
  onReset,
  onCamera,
  onGallery,
}: Props) {
  const { t, locale } = useT();
  const grid = useRef<HTMLDivElement>(null);
  // Desktop: one «Choose file» instead of camera and library (D.1).
  const desktop = window.matchMedia?.(DESKTOP_MEDIA).matches === true;

  // Opens with the current tile centred, its neighbours in view (4.1).
  useEffect(() => {
    if (open)
      grid.current
        ?.querySelector('[aria-checked="true"]')
        ?.scrollIntoView?.({ block: 'center' });
  }, [open]);

  // Arrows move within the radiogroup; Enter or Space applies (D.1).
  const onKeyDown = (event: KeyboardEvent) => {
    const tiles = [
      ...(grid.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []),
    ];
    const at = tiles.indexOf(document.activeElement as HTMLElement);
    const cols = getComputedStyle(grid.current!)
      .gridTemplateColumns.split(' ')
      .filter(Boolean).length;
    const step =
      STEP[event.key] ??
      { ArrowUp: -cols, ArrowDown: cols }[event.key as 'ArrowUp'];
    const next = tiles[at + (step ?? 0)];
    if (at < 0 || !step || !next) return;
    event.preventDefault();
    next.focus();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('edit.illo.title')}>
      <div className="illo-picker">
        <p className="illo-picker__sub">
          <span>
            {t(manual ? 'edit.illo.manual' : 'edit.illo.auto', { name })}
          </span>
          {manual && (
            <button
              type="button"
              className="illo-picker__reset"
              onClick={onReset}
            >
              {t('edit.illo.reset')}
            </button>
          )}
        </p>
        {onCamera && onGallery && (
          <>
            <div className="illo-picker__actions">
              {desktop ? (
                <Button variant="tonal" small onClick={onGallery}>
                  <Upload aria-hidden="true" />
                  {t('edit.illo.file')}
                </Button>
              ) : (
                <>
                  <Button variant="tonal" small onClick={onCamera}>
                    <Camera aria-hidden="true" />
                    {t('edit.illo.camera')}
                  </Button>
                  <Button variant="tonal" small onClick={onGallery}>
                    <Image aria-hidden="true" />
                    {t('edit.illo.gallery')}
                  </Button>
                </>
              )}
            </div>
            <p className="illo-picker__note">{t('edit.illo.photo_note')}</p>
          </>
        )}
        <h3 className="illo-picker__heading">{t('edit.illo.grid')}</h3>
        <div
          ref={grid}
          className="illo-picker__grid"
          role="radiogroup"
          aria-label={t('edit.illo.grid')}
          onKeyDown={onKeyDown}
        >
          {ILLUSTRATION_IDS.map((id) => {
            const on = id === current;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                // Roving focus: Tab enters on the current tile, arrows move (D.1).
                tabIndex={on ? 0 : -1}
                className={`illo-picker__tile${on ? ' illo-picker__tile--on' : ''}`}
                onClick={() => onPick(id)}
              >
                <DishIllustration id={id} size="var(--illo-pick-size)" />
                {on && (
                  <span className="illo-picker__check" aria-hidden="true">
                    <Check />
                  </span>
                )}
                <span>{illustrationLabel(id, locale)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
