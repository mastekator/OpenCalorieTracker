import {
  CATEGORIES,
  NAMES,
  type IllustrationId,
  type Locale,
} from '@oct/shared';
import sprite from '../../illustrations/sprite.svg?raw';
import './DishIllustration.css';

// The sprite goes into the page once, so every <use> resolves offline without a request.
if (typeof document !== 'undefined' && !document.getElementById('illo-plate'))
  document.body.insertAdjacentHTML('afterbegin', sprite);

type Props = {
  id: IllustrationId;
  /** CSS length from the tokens; default `--dish-illo-size`. */
  size?: string;
};

/** A dish illustration: round tile, flat art — never passes for a photo (OCT-33). Decorative (AC-5.4). */
export function DishIllustration({ id, size }: Props) {
  return (
    <span
      className="dish-illo"
      style={size ? { width: size, height: size } : undefined}
      aria-hidden="true"
      data-illo={id}
    >
      <svg viewBox="0 0 48 48">
        <use href={`#illo-${id}`} />
      </svg>
    </span>
  );
}

/** Caption of an illustration: its own name, else its category's (OCT-33 picker). */
export const illustrationLabel = (id: IllustrationId, locale: Locale) =>
  NAMES[id]?.[locale === 'ru' ? 0 : 1] ??
  CATEGORIES.find((c) => (c.items as readonly string[]).includes(id))![locale];
