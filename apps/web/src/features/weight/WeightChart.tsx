import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChevronRight } from 'lucide-react';
import { daysBetween, type Units, type Weighing } from '@oct/shared';
import { useT } from '../../i18n';
import { useWeightFormat } from './format';
import { nearest, weightAxis, xTicks } from './weightScale';
import './WeightChart.css';

/** Above this many dots they merge into a band: only the trend is drawn (ADR-0016 §6). */
export const MAX_DOTS = 400;
/** The SVG layer is stretched to the plot; its own units are 0..1000 both ways. */
const S = 1000;

type Props = {
  /** Weighings in the period, by date ascending, at least one. */
  points: readonly Weighing[];
  /** Trend at each of `points` (kg); null below three weighings in the whole history. */
  trend: readonly number[] | null;
  /** First day of the x axis (`axisStart`); the last is today. */
  start: string;
  today: string;
  units: Units;
  /** Goal weight, kg; the axis widens to show it (AC-9.24). */
  target: number | null;
  /** The whole picture in one phrase for screen readers. */
  label: string;
  /** Date of the picked weighing: tip, line and ring. */
  selected: string | null;
  onSelect: (date: string | null) => void;
  /** Opens the weighing in the edit sheet. */
  onEdit: (date: string) => void;
};

/**
 * Weight over a period (OCT-189 §3): pale dots, the trend line, the dashed goal, values on the
 * right. Lines are one stretched SVG with non-scaling strokes (dots are zero-length round caps),
 * labels and markers are HTML on top, so text never stretches. Touch or drag picks the nearest
 * weighing and shows a tip that opens it; a mouse hovers to pick and clicks to open; the keyboard
 * moves with ←/→ and opens with Enter.
 */
export function WeightChart({
  points,
  trend,
  start,
  today,
  units,
  target,
  label,
  selected,
  onSelect,
  onEdit,
}: Props) {
  const { t, locale } = useT();
  const f = useWeightFormat(units);
  const root = useRef<HTMLDivElement>(null);
  // The press in progress: the pick before it, the weighing pressed, a drag to another one.
  const press = useRef<{
    before: string | null;
    date: string;
    moved: boolean;
  } | null>(null);

  // A tapped tip closes on a tap outside the chart or on Esc.
  useEffect(() => {
    if (!selected) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onSelect(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [selected, onSelect]);

  const span = Math.max(daysBetween(start, today), 1);
  const days = points.map((p) => daysBetween(start, p.date));
  const xOf = (day: number) => day / span;
  const values = points.map((p) => f.shown(p.weightKg));
  const trendValues = trend?.map(f.shown) ?? [];
  const goal = target === null ? null : f.shown(target);
  const axis = weightAxis([
    ...values,
    ...trendValues,
    ...(goal === null ? [] : [goal]),
  ]);
  const yOf = (v: number) => (axis.hi - v) / (axis.hi - axis.lo);
  const at = (i: number) => `${xOf(days[i]!) * S} ${yOf(values[i]!) * S}`;
  const pct = (share: number) => `${share * 100}%`;

  const last = points.length - 1;
  const sel =
    selected === null ? -1 : points.findIndex((p) => p.date === selected);

  const pick = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = nearest(days, ((e.clientX - r.left) / (r.width || 1)) * span);
    const date = points[i]!.date;
    if (date !== selected) onSelect(date);
    return date;
  };

  const formats = {
    day: { day: 'numeric' },
    day_month: { day: 'numeric', month: 'short' },
    month: { month: 'short' },
    year: { year: 'numeric' },
  } as const;
  const ticks = xTicks(start, today).map(({ date, kind }) => {
    const x = xOf(daysBetween(start, date));
    // Days centre on their date, flush near an edge; months and years start at their tick.
    const align =
      kind === 'day' || kind === 'day_month'
        ? x < 0.06
          ? 'start'
          : x > 0.94
            ? 'end'
            : 'center'
        : x > 0.9
          ? null
          : 'tick';
    const text = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      ...formats[kind],
    }).format(new Date(`${date}T00:00:00Z`));
    return { date, x, align, text };
  });

  const axisLabel = (v: number) =>
    axis.step < 1 ? f.n1(v) : new Intl.NumberFormat(locale).format(v);

  return (
    <div ref={root} className="wchart">
      <div className="wchart__body">
        <div className="wchart__area">
          <div
            className="wchart__plot"
            role="img"
            aria-label={label}
            tabIndex={0}
            onPointerDown={(e) => {
              // Keeps the moves coming when the finger leaves the plot (absent in jsdom).
              e.currentTarget.setPointerCapture?.(e.pointerId);
              press.current = { before: selected, date: pick(e), moved: false };
            }}
            onPointerMove={(e) => {
              const p = press.current;
              if (p) {
                if (pick(e) !== p.date) p.moved = true;
              } else if (e.pointerType === 'mouse') pick(e);
            }}
            onPointerUp={(e) => {
              const p = press.current;
              press.current = null;
              if (!p) return;
              const date = pick(e);
              // A mouse opens at once; a finger opens on a second tap of the same weighing.
              if (e.pointerType === 'mouse' || (!p.moved && p.before === date))
                onEdit(date);
            }}
            onPointerCancel={() => {
              // The browser took the gesture for a scroll: put the pick back.
              if (press.current) onSelect(press.current.before);
              press.current = null;
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse' && !press.current) onSelect(null);
            }}
            onKeyDown={(e) => {
              const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
              if (step) {
                e.preventDefault();
                const i =
                  sel < 0 ? last : Math.min(Math.max(sel + step, 0), last);
                onSelect(points[i]!.date);
              } else if (e.key === 'Enter' && sel >= 0)
                onEdit(points[sel]!.date);
              else if (e.key === 'Escape' && sel >= 0) onSelect(null);
            }}
          >
            <svg
              className="wchart__svg"
              viewBox={`0 0 ${S} ${S}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {axis.ticks.map((v) => (
                <line
                  key={v}
                  className="wchart__grid"
                  x1={0}
                  x2={S}
                  y1={yOf(v) * S}
                  y2={yOf(v) * S}
                />
              ))}
              {goal !== null && (
                <line
                  className="wchart__goal"
                  x1={0}
                  x2={S}
                  y1={yOf(goal) * S}
                  y2={yOf(goal) * S}
                />
              )}
              {points.length > 1 && points.length <= MAX_DOTS && (
                <path
                  className="wchart__dots"
                  d={points.map((_, i) => `M${at(i)}h0`).join('')}
                />
              )}
              {trend && points.length > 1 && (
                <path
                  className="wchart__trend"
                  d={trendValues
                    .map(
                      (v, i) =>
                        `${i ? 'L' : 'M'}${xOf(days[i]!) * S} ${yOf(v) * S}`,
                    )
                    .join('')}
                />
              )}
            </svg>
            <div className="wchart__ticks" aria-hidden="true">
              {ticks.map(({ date, x }) => (
                <i key={date} style={{ left: pct(x) }} />
              ))}
            </div>
            {goal !== null && (
              <span
                className="wchart__goal-label"
                aria-hidden="true"
                style={{ top: pct(yOf(goal)) }}
              >
                {t('weight_screen.goal', { weight: f.n01(goal) })}
              </span>
            )}
            {sel >= 0 && (
              <span
                className="wchart__cross"
                aria-hidden="true"
                style={{ left: pct(xOf(days[sel]!)) }}
              />
            )}
            <span
              className="wchart__last"
              aria-hidden="true"
              style={{
                left: pct(xOf(days[last]!)),
                top: pct(yOf(values[last]!)),
              }}
            />
            {sel >= 0 && (
              <span
                className="wchart__ring"
                aria-hidden="true"
                style={{
                  left: pct(xOf(days[sel]!)),
                  top: pct(yOf(values[sel]!)),
                }}
              />
            )}
          </div>
          {sel >= 0 && (
            <button
              type="button"
              className="wchart__tip"
              tabIndex={-1}
              aria-hidden="true"
              style={{
                left: pct(xOf(days[sel]!)),
                top: pct(yOf(values[sel]!)),
                translate: `${-Math.round(xOf(days[sel]!) * 100)}% 0`,
              }}
              onClick={() => onEdit(points[sel]!.date)}
            >
              {f.day(points[sel]!.date)} ·{' '}
              <b>{f.weight(points[sel]!.weightKg)}</b>
              <span className="wchart__tip-go">
                {t('weight_screen.edit')}
                <ChevronRight aria-hidden="true" />
              </span>
            </button>
          )}
        </div>
        <span className="wchart__live" aria-live="polite">
          {sel >= 0 &&
            `${f.day(points[sel]!.date)} · ${f.weight(points[sel]!.weightKg)}`}
        </span>
        <ol className="wchart__axis" aria-hidden="true">
          {axis.ticks.map((v) => (
            <li key={v} style={{ top: pct(yOf(v)) }}>
              {axisLabel(v)}
            </li>
          ))}
        </ol>
        <ol className="wchart__months" aria-hidden="true">
          {ticks.map(
            ({ date, x, align, text }) =>
              align && (
                <li
                  key={date}
                  className={`wchart__x--${align}`}
                  style={{ left: pct(x) }}
                >
                  {text}
                </li>
              ),
          )}
        </ol>
      </div>
    </div>
  );
}
