import { useId, useRef, useState } from 'react';
import { CalendarDays, Info, Minus, Plus, Trash2, Weight } from 'lucide-react';
import {
  commaFix,
  daysBetween,
  effectiveNorm,
  jumpCheck,
  round1,
  unitRanges,
  weightFromKg,
  weightToKg,
  type ProfileResponse,
  type Units,
  type Weighing,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { DayCalendar } from '../../ui/DayCalendar/DayCalendar';
import { List, ListRow } from '../../ui/List/List';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useToast } from '../../ui/Toast/Toast';
import { usePressRepeat } from '../../ui/usePressRepeat';
import { WeightRuler } from '../../ui/WeightRuler/WeightRuler';
import '../../ui/WeightStepper/WeightStepper.css';
import { UNDO_MS } from '../diary/undoDelete';
import { NB, useWeightFormat } from './format';
import './WeighInSheet.css';

/** Where the ruler starts with no weighing and no profile weight. */
const DEFAULT_KG = 70;

type Props = {
  open: boolean;
  onClose: () => void;
  /** Local today, `YYYY-MM-DD`. */
  today: string;
  units: Units;
  /** The weight diary, any order. */
  weighings: readonly Weighing[];
  /** Birth date bounds the calendar; profile and manual norm go into the «saved» toast. */
  profile: ProfileResponse;
  /** Date of the weighing to edit; without it the sheet logs a new one. */
  edit?: string;
  /** Records the day's weight; the sheet is closed after it. */
  onPut: (date: string, weightKg: number) => Promise<void>;
  onDelete: (date: string) => Promise<void>;
};

/** Log or edit a weighing (OCT-189 §2, 3.3–3.5): sheet on the phone, dialog on desktop. */
export function WeighInSheet(props: Props) {
  // Mounted only while open, so every opening starts fresh.
  return props.open ? <WeighIn {...props} /> : null;
}

type Ask =
  | { kind: 'typo'; text: string; fix: number }
  | { kind: 'jump'; v: number; diff: number; nearest: Weighing }
  | { kind: 'replace'; v: number };

function WeighIn({
  onClose,
  today,
  units,
  weighings,
  profile,
  edit,
  onPut,
  onDelete,
}: Props) {
  const { t, locale } = useT();
  const toast = useToast();
  const hintId = useId();
  const range = unitRanges(units).weight;
  const unit = t(units === 'us' ? 'unit.lb' : 'unit.kg');
  const byDate = new Map(weighings.map((w) => [w.date, w.weightKg]));
  const latest = weighings.reduce<Weighing | null>(
    (a, w) => (!a || w.date > a.date ? w : a),
    null,
  );
  const [startKg] = useState(
    () =>
      (edit !== undefined ? byDate.get(edit) : undefined) ??
      latest?.weightKg ??
      profile.profile.weightKg ??
      DEFAULT_KG,
  );
  const [date, setDate] = useState(edit ?? today);
  const [value, setValue] = useState(() => weightFromKg(startKg, units));
  // Text while the number is a keyboard field (2.2); null while it is the big number.
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [picking, setPicking] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);

  const num = (n: number, digits = 1) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: 1,
    }).format(n);
  const weight = (v: number) => `${num(v)}${NB}${unit}`;
  const fmt = useWeightFormat(units);
  const short = fmt.short;
  const dayName = (d: string) =>
    d === today ? t('weighing.today', { date: short(d) }) : fmt.day(d);
  /** The typed number in the locale's format, up to 2 decimals; unparsable text stays as typed. */
  const typed = (s: string) => {
    const n = Number(s.trim().replace(',', '.'));
    return Number.isFinite(n)
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n)
      : s.trim();
  };

  const parse = (s: string) => {
    const n = Number(s.trim().replace(',', '.'));
    return s.trim() === '' || !Number.isFinite(n) ? null : round1(n);
  };
  const inRange = (n: number | null): n is number =>
    n !== null && n >= range.min && n <= range.max;

  const valueRef = useRef(value);
  valueRef.current = value;
  const textRef = useRef(text);
  textRef.current = text;
  const repeat = usePressRepeat((dir) => {
    // − / + from the keyboard field step from what was typed.
    let base = valueRef.current;
    if (textRef.current !== null) {
      const n = parse(textRef.current);
      if (!inRange(n)) return repeat.stop();
      base = n;
      textRef.current = null;
      setText(null);
    }
    const next = Math.min(
      range.max,
      Math.max(range.min, round1(base + dir / 10)),
    );
    valueRef.current = next;
    setValue(next);
    // At the edge the button disables and may never get pointerup.
    if (next === base) repeat.stop();
  });

  /** Leaves the keyboard field when it holds a valid weight. */
  function endTyping() {
    const n = text === null ? null : parse(text);
    if (!inRange(n)) return;
    setValue(n);
    setText(null);
  }

  function submit() {
    if (text === null) return check(value, 'jump');
    const n = parse(text);
    if (inRange(n)) {
      setValue(n);
      setText(null);
      return check(n, 'jump');
    }
    const fix = commaFix(text, range);
    if (fix !== null) setAsk({ kind: 'typo', text, fix });
    else setError(true);
  }

  // Untouched, the stored kg goes back as is: 180 lb stays 180 lb (ADR-0014 §2).
  const toKg = (v: number) =>
    v === weightFromKg(startKg, units) ? startKg : weightToKg(v, units);

  function check(v: number, from: 'jump' | 'replace') {
    const kg = toKg(v);
    if (from === 'jump') {
      // jumpCheck against the weighing nearest by date, not counting the day itself (AC-9.5).
      const nearest = weighings
        .filter((w) => w.date !== date && w.date !== edit)
        .reduce<Weighing | null>((a, w) => {
          if (!a) return w;
          const dw = Math.abs(daysBetween(w.date, date));
          const da = Math.abs(daysBetween(a.date, date));
          return dw < da || (dw === da && w.date < a.date) ? w : a;
        }, null);
      const diff = jumpCheck(kg, nearest);
      if (diff !== null && nearest)
        return setAsk({ kind: 'jump', v, diff, nearest });
    }
    if (edit !== undefined && date !== edit && byDate.has(date))
      return setAsk({ kind: 'replace', v });
    void save(v, kg);
  }

  async function save(v: number, kg: number) {
    setAsk(null);
    const kcal = (weightKg: number | null) =>
      effectiveNorm({ ...profile.profile, weightKg }, profile.manual, today)
        ?.kcal;
    const after = weighings
      .filter((w) => w.date !== date && w.date !== edit)
      .concat({ date, weightKg: kg })
      .reduce((a, w) => (w.date > a.date ? w : a));
    const before = kcal(profile.profile.weightKg);
    const now = kcal(after.weightKg);
    // Moving a weighing to another day is delete + put (ADR-0016).
    if (edit !== undefined && edit !== date) await onDelete(edit);
    await onPut(date, kg);
    onClose();
    toast({
      icon: <Weight />,
      text:
        date !== today
          ? t('weighing.saved_for', { date: short(date) })
          : now !== undefined && before !== now
            ? t('weighing.saved_norm', {
                weight: weight(v),
                kcal: new Intl.NumberFormat(locale).format(now),
              })
            : t('weighing.saved', { weight: weight(v) }),
    });
  }

  // No confirmation: «Undo» puts the same weighing back (3.4, AC-9.6).
  async function remove(day: string) {
    const kg = byDate.get(day)!;
    await onDelete(day);
    onClose();
    toast({
      icon: <Trash2 />,
      text: t('weighing.deleted', {
        date: short(day),
        weight: weight(weightFromKg(kg, units)),
      }),
      ms: UNDO_MS,
      action: { label: t('common.undo'), onClick: () => void onPut(day, kg) },
    });
  }

  if (picking)
    return (
      <Sheet
        open
        onClose={() => setPicking(false)}
        title={t('weighing.date_title')}
        footer={
          <Button onClick={() => setPicking(false)}>
            {t('weighing.done')}
          </Button>
        }
      >
        <DayCalendar
          value={date}
          today={today}
          min={profile.profile.birthDate ?? undefined}
          marked={new Set(byDate.keys())}
          onChange={setDate}
        />
      </Sheet>
    );

  const taken = byDate.get(date);
  const stepText = `${num(0.1)}${NB}${unit}`;
  const stepButton = (dir: 1 | -1) => (
    <button
      type="button"
      className="stepper__button"
      aria-label={t(dir < 0 ? 'weighing.less' : 'weighing.more', {
        step: stepText,
      })}
      disabled={
        text === null && (dir < 0 ? value <= range.min : value >= range.max)
      }
      {...repeat.bind(dir)}
    >
      {dir < 0 ? <Minus aria-hidden="true" /> : <Plus aria-hidden="true" />}
    </button>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        edit !== undefined
          ? t('weighing.title_edit', { date: short(edit) })
          : date === today
            ? t('weighing.title')
            : t('weighing.title_for', { date: short(date) })
      }
      footer={
        <>
          <Button onClick={submit}>{t('weighing.save')}</Button>
          {edit !== undefined && (
            <Button variant="danger-plain" onClick={() => void remove(edit)}>
              <Trash2 aria-hidden="true" />
              {t('weighing.delete')}
            </Button>
          )}
        </>
      }
    >
      <div className="weigh-in">
        <List>
          <ListRow
            icon={<CalendarDays />}
            value={dayName(date)}
            onClick={() => setPicking(true)}
          >
            {t('weighing.date')}
          </ListRow>
        </List>
        {edit === undefined && taken !== undefined && (
          <p className="weigh-in__note">
            <Info aria-hidden="true" />
            {t('weighing.exists', {
              date: short(date),
              weight: weight(weightFromKg(taken, units)),
            })}
          </p>
        )}
        <div className="weigh-in__value">
          {stepButton(-1)}
          {text === null ? (
            <button
              type="button"
              className="weigh-in__number"
              // The visible number starts the name (WCAG 2.5.3).
              aria-label={`${weight(value)}, ${t('weighing.type')}`}
              onClick={() => setText(num(value))}
            >
              <span className="tabular-nums">{num(value)}</span>{' '}
              <span className="weigh-in__unit">{unit}</span>
            </button>
          ) : (
            <label
              className={`weigh-in__number weigh-in__number--field${error ? ' weigh-in__number--error' : ''}`}
            >
              <input
                className="weigh-in__input tabular-nums"
                inputMode="decimal"
                aria-label={t('weighing.weight')}
                aria-invalid={error}
                aria-describedby={hintId}
                autoFocus
                style={{ width: `${Math.max(text.length, 1)}ch` }}
                value={text}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(false);
                }}
                onBlur={endTyping}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  submit();
                }}
              />
              <span className="weigh-in__unit">{unit}</span>
            </label>
          )}
          {stepButton(1)}
        </div>
        {text === null ? (
          <WeightRuler
            value={value}
            units={units}
            label={t('weighing.weight')}
            onChange={setValue}
          />
        ) : (
          <p
            id={hintId}
            className={`weigh-in__range${error ? ' weigh-in__range--error' : ''}`}
          >
            {t('weighing.range', {
              min: num(range.min, 0),
              max: num(range.max, 0),
              unit,
            })}
          </p>
        )}
        <p className="weigh-in__hint">{t('weighing.hint')}</p>
      </div>

      <ConfirmDialog
        open={ask?.kind === 'typo'}
        tone="primary"
        title={
          ask?.kind === 'typo'
            ? t(
                (parse(ask.text) ?? 0) < range.min
                  ? 'weighing.typo_below'
                  : 'weighing.typo_above',
                {
                  weight: `${typed(ask.text)}${NB}${unit}`,
                  min: `${num(range.min, 0)}${NB}${unit}`,
                  max: `${num(range.max, 0)}${NB}${unit}`,
                },
              )
            : ''
        }
        body={
          ask?.kind === 'typo'
            ? t('weighing.typo_body', { fix: weight(ask.fix) })
            : undefined
        }
        cancelLabel={t('weighing.fix')}
        confirmLabel={
          ask?.kind === 'typo'
            ? t('weighing.typo_yes', { fix: weight(ask.fix) })
            : ''
        }
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          if (ask?.kind !== 'typo') return;
          setAsk(null);
          setValue(ask.fix);
          setText(null);
          check(ask.fix, 'jump');
        }}
      />
      <ConfirmDialog
        open={ask?.kind === 'jump'}
        tone="primary"
        title={t('weighing.jump_title')}
        body={
          ask?.kind === 'jump'
            ? t(ask.diff > 0 ? 'weighing.jump_more' : 'weighing.jump_less', {
                weight: weight(ask.v),
                prev: fmt.weight(ask.nearest.weightKg),
                diff: weight(
                  Math.abs(
                    round1(ask.v - weightFromKg(ask.nearest.weightKg, units)),
                  ),
                ),
                date: short(ask.nearest.date),
              })
            : undefined
        }
        cancelLabel={t('weighing.fix')}
        confirmLabel={t('weighing.save')}
        onCancel={() => setAsk(null)}
        onConfirm={() => ask?.kind === 'jump' && check(ask.v, 'replace')}
      />
      <ConfirmDialog
        open={ask?.kind === 'replace'}
        tone="primary"
        title={
          taken !== undefined
            ? t('weighing.replace_title', {
                date: short(date),
                weight: weight(weightFromKg(taken, units)),
              })
            : ''
        }
        body={
          ask?.kind === 'replace'
            ? t('weighing.replace_body', { weight: weight(ask.v) })
            : undefined
        }
        confirmLabel={t('weighing.replace')}
        onCancel={() => setAsk(null)}
        onConfirm={() =>
          ask?.kind === 'replace' && void save(ask.v, toKg(ask.v))
        }
      />
    </Sheet>
  );
}
