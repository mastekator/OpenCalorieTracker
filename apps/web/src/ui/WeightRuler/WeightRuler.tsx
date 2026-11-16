import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { round1, unitRanges, type Units } from '@oct/shared';
import { useT } from '../../i18n';
import './WeightRuler.css';

/** Ticks drawn each side of the pointer: wider than the desktop dialog at 10 px a tick. */
const SIDE = 30;
/** viewBox units per tick; the SVG is scaled so one tick is --weight-tick-gap wide. */
const GAP = 10;

type Props = {
  /** Body weight in the user's units (kg or lb), step 0.1. */
  value: number;
  units: Units;
  /** Accessible name, e.g. «Weight». */
  label: string;
  onChange: (value: number) => void;
};

/** Swipe ruler under the weigh-in number (OCT-189 §2): 0.1 a tick, labels every 0.5. */
export function WeightRuler({ value, units, label, onChange }: Props) {
  const { locale } = useT();
  const { min, max } = unitRanges(units).weight;
  const ref = useRef<HTMLDivElement>(null);
  // Latest value, ahead of the render: fast wheel events must not repeat a step.
  const valueRef = useRef(value);
  valueRef.current = value;
  const set = (next: number) => {
    const v = Math.min(max, Math.max(min, round1(next)));
    if (v === valueRef.current) return;
    valueRef.current = v;
    onChange(v);
  };
  // Native listener: React's onWheel is passive and can't stop the sheet from scrolling.
  const setRef = useRef(set);
  setRef.current = set;
  useEffect(() => {
    const el = ref.current!;
    const wheel = (e: WheelEvent) => {
      const delta = e.deltaY || e.deltaX;
      if (!delta) return;
      e.preventDefault();
      setRef.current(valueRef.current + (delta < 0 ? 0.1 : -0.1));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const fmt = (n: number, digits: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  const valueText = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units === 'us' ? 'pound' : 'kilogram',
    unitDisplay: 'long',
    maximumFractionDigits: 1,
  }).format(value);

  // shortcut: the ruler jumps a whole tick per 0.1 and has no inertia; add a fling if it feels stiff on phones.
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const tickPx = () =>
    (ref.current!.querySelector('svg')!.getBoundingClientRect().width ||
      (2 * SIDE + 1) * GAP) /
    (2 * SIDE + 1);
  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, v: value, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    if (d.moved) set(d.v - Math.round(dx / tickPx()) / 10);
  }
  function onPointerUp(e: PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // A tap on a tick moves the value to it.
    const box = e.currentTarget.getBoundingClientRect();
    set(
      value +
        Math.round((e.clientX - box.left - box.width / 2) / tickPx()) / 10,
    );
  }

  function onKeyDown(e: KeyboardEvent) {
    const dir = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[
      e.key
    ];
    if (!dir) return;
    e.preventDefault();
    set(value + dir / 10);
  }

  const center = Math.round(value * 10);
  const ticks = [];
  for (let k = -SIDE; k <= SIDE; k++) {
    const t = center + k;
    if (t < min * 10 || t > max * 10) continue;
    const x = (k + SIDE + 0.5) * GAP;
    const whole = t % 10 === 0;
    const half = t % 5 === 0;
    ticks.push(
      <line
        key={t}
        className={`ruler__tick${half ? ' ruler__tick--half' : ''}`}
        x1={x}
        x2={x}
        y1={4}
        y2={whole ? 34 : half ? 28 : 16}
      />,
    );
    if (half)
      ticks.push(
        <text
          key={`l${t}`}
          className={`ruler__label${k === 0 ? ' ruler__label--on' : ''}`}
          x={x}
          y={54}
        >
          {fmt(t / 10, whole ? 0 : 1)}
        </text>,
      );
  }

  return (
    <div
      ref={ref}
      className="ruler"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${(2 * SIDE + 1) * GAP} 64`}
        className="ruler__scale"
      >
        {ticks}
      </svg>
    </div>
  );
}
