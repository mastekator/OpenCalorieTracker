import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChevronRight } from 'lucide-react';
import { addDays, daysBetween, type Units, type Weighing } from '@oct/shared';
import { useT } from '../../i18n';
import { useWeightFormat } from './format';
import { nearest, weightAxis } from './weightScale';
import './WeightChart.css';

/** Above this many dots they merge into a band: only the trend is drawn (ADR-0016 §6). */
export const MAX_DOTS = 400;
/** The SVG layer is stretched to the plot; its own units are 0..1000 both ways. */
const S = 1000;
/** Month labels closer than this share of the width give way to the earlier one. */
const LABEL_GAP = 0.12;

type Props = {
  /** Weighings in the period, by date ascending, at least one. */
  points: readonly Weighing[];
  /** Trend at each of `points` (kg); null below three weighings in the whole history. */
  trend: readonly number[] | null;
  /** First day of the x axis; the last is today. */
  from: string;
  today: string;
  units: Units;
  /** Goal weight, kg; the axis widens to show it (AC-9.24). */
  target: number | null;
  /** Mondays under the plot instead of month starts. */
  weeks: boolean;
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
  from,
  today,
  units,
  target,
  weeks,
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

  const span = Math.max(daysBetween(from, today), 1);
  const days = points.map((p) => daysBetween(from, p.date));
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

  // Mondays on «Month», month starts otherwise, Jan 1 with the year past two years.
  const long = span > 730;
  const tickFormat = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    ...(weeks
      ? { day: 'numeric', month: 'short' }
      : long
        ? { year: 'numeric' }
        : { month: 'short' }),
  });
  const ticks: { date: string; x: number }[] = [];
  for (let d = 0; d <= span; d++) {
    const date = addDays(from, d);
    const mark = weeks
      ? new Date(`${date}T00:00:00Z`).getUTCDay() === 1
      : date.endsWith(long ? '-01-01' : '-01');
    const x = xOf(d);
    // Centred labels: none so close to an edge that they stick out.
    if (!mark || x < LABEL_GAP / 3 || x > 1 - LABEL_GAP / 2) continue;
    if (ticks.length && x - ticks.at(-1)!.x < LABEL_GAP) continue;
    ticks.push({ date, x });
  }

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
          {ticks.map(({ date, x }) => (
            <li key={date} style={{ left: pct(x) }}>
              {tickFormat.format(new Date(`${date}T00:00:00Z`))}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
