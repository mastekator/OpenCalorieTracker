import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { CircleAlert, Minus, Plus } from 'lucide-react';
import {
  DISH_GRAMS,
  dishWeightRange,
  gToOz,
  ozToG,
  round1,
  type Units,
} from '@oct/shared';
import { useT } from '../../i18n';
import './WeightStepper.css';

/** Long press: first repeat after 400 ms, then every 100 ms (OCT-16 4.2). */
const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 100;

type Props = {
  /** Current weight in grams; null while the field holds an invalid value. */
  grams: number | null;
  units: Units;
  /** Accessible name of the field, e.g. «Weight of Buckwheat». */
  label: string;
  /** Grams on every valid change, null when the field becomes empty or out of range (AC-3.4). */
  onChange: (grams: number | null) => void;
};

/** − [weight] +: grams or ounces, ±10 g / ±0.5 oz, long press repeats, typing recalculates live. */
export function WeightStepper({ grams, units, label, onChange }: Props) {
  const { t, locale } = useT();
  const errorId = useId();
  const range = dishWeightRange(units);
  const us = units === 'us';
  const show = (value: number) =>
    us
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
          value,
        )
      : String(value);
  const toText = (g: number) => show(us ? gToOz(g) : Math.round(g));
  const [text, setText] = useState(() => (grams === null ? '' : toText(grams)));

  /** Value in the user's units, rounded to the input step, or null if not a number. */
  const parse = (s: string) => {
    const n = Number(s.trim().replace(',', '.'));
    if (s.trim() === '' || !Number.isFinite(n)) return null;
    return us ? round1(n) : Math.round(n);
  };
  const inRange = (v: number | null): v is number =>
    v !== null && v >= range.min && v <= range.max;
  // 176.4 oz is 5000.9 g: cap so the stored weight stays within 1–5000 g.
  const toGrams = (v: number) => (us ? Math.min(ozToG(v), DISH_GRAMS.max) : v);

  // Last value sent up: a different `grams` prop is an outside change (undo, history) to show.
  const sent = useRef(grams);
  useEffect(() => {
    if (grams !== sent.current && grams !== null) {
      sent.current = grams;
      setText(toText(grams));
    }
  });

  function commit(next: string) {
    setText(next);
    const v = parse(next);
    const g = inRange(v) ? toGrams(v) : null;
    sent.current = g;
    onChange(g);
  }

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stop = () => clearTimeout(timer.current);

  const textRef = useRef(text);
  textRef.current = text;
  function step(dir: 1 | -1) {
    const v = parse(textRef.current) ?? range.min;
    const next = Math.min(
      range.max,
      Math.max(
        range.min,
        us ? round1(v + dir * range.step) : v + dir * range.step,
      ),
    );
    // At the edge the button disables and may never get pointerup: end the repeat here.
    if (next === v) return stop();
    const nextText = show(next);
    textRef.current = nextText;
    commit(nextText);
  }

  useEffect(() => stop, []);
  function press(dir: 1 | -1) {
    step(dir);
    const repeat = (delay: number) => {
      timer.current = setTimeout(() => {
        step(dir);
        repeat(REPEAT_EVERY_MS);
      }, delay);
    };
    repeat(REPEAT_DELAY_MS);
  }

  const v = parse(text);
  const valid = inRange(v);
  const stepText = `${show(range.step)} ${t(us ? 'unit.oz' : 'unit.g')}`;
  const button = (dir: 1 | -1) => {
    const atEdge = valid && (dir < 0 ? v <= range.min : v >= range.max);
    return (
      <button
        type="button"
        className="stepper__button"
        aria-label={t(dir < 0 ? 'edit.weight.less' : 'edit.weight.more', {
          step: stepText,
        })}
        disabled={atEdge}
        onPointerDown={(e) => {
          if (e.button === 0) press(dir);
        }}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        // Keyboard Enter/Space click (detail 0); pointer clicks already stepped on press.
        onClick={(e: MouseEvent) => {
          if (e.detail === 0) step(dir);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {dir < 0 ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}
      </button>
    );
  };

  function onKeyDown(e: KeyboardEvent) {
    const dir = { ArrowUp: 1, ArrowDown: -1 }[e.key] as 1 | -1 | undefined;
    if (!dir) return;
    e.preventDefault();
    step(dir);
  }

  return (
    <div className={`stepper${valid ? '' : ' stepper--error'}`}>
      <div className="stepper__row">
        {button(-1)}
        <label className="stepper__box">
          <input
            className="stepper__input tabular-nums"
            inputMode={us ? 'decimal' : 'numeric'}
            aria-label={label}
            aria-invalid={!valid}
            aria-describedby={valid ? undefined : errorId}
            value={text}
            onChange={(e) => commit(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={onKeyDown}
          />
          <span className="stepper__unit" aria-hidden="true">
            {t(us ? 'unit.oz' : 'unit.g')}
          </span>
        </label>
        {button(1)}
      </div>
      {!valid && (
        <p id={errorId} className="stepper__error">
          <CircleAlert aria-hidden="true" />
          {t(us ? 'edit.weight.err_oz' : 'edit.weight.err_g')}
        </p>
      )}
    </div>
  );
}
