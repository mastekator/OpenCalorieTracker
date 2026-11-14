import './ProgressBar.css';

type Props = {
  /** Eaten so far, unrounded. */
  value: number;
  /** The norm; past it the bar rescales to `value` and shows a hatched tail. */
  max: number;
  tone?: 'accent' | 'protein' | 'fat' | 'carbs';
  /** What the bar measures, e.g. «Protein». */
  label: string;
  /** Spoken value, e.g. «1,240 of 2,100 kcal». */
  valueText?: string;
};

/** Fill up to the norm; anything over it is a hatched warning tail, so it reads without colour (AC-1.4). */
export function ProgressBar({
  value,
  max,
  tone = 'accent',
  label,
  valueText,
}: Props) {
  const over = value > max;
  const scale = Math.max(value, max) || 1;
  const fill = (Math.min(value, max) / scale) * 100;
  return (
    <div
      className={`progress progress--${tone}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(Math.min(value, max))}
      aria-valuetext={valueText}
    >
      <span className="progress__fill" style={{ width: `${fill}%` }} />
      {over && (
        <span className="progress__over" style={{ width: `${100 - fill}%` }} />
      )}
    </div>
  );
}
