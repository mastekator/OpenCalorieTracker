import {
  addDays,
  addYears,
  ageYears,
  birthDateError,
  calculateNorm,
  CM_PER_INCH,
  deadlineError,
  lbToKg,
  profileSchema,
  REQUIRED_FIELDS,
  targetWeightError,
  unitRanges,
  weightFromKg,
  type AssistantMessage,
  type InterviewDraft,
  type InterviewField,
  type InterviewState,
  type InterviewTurn,
  type MeasureField,
  type Profile,
  type Units,
} from '@oct/shared';

type Kind = 'height' | 'weight';
type Unit = 'cm' | 'in' | 'kg' | 'lb';

const SYSTEM_UNIT: Record<Kind, Record<Units, Unit>> = {
  height: { metric: 'cm', us: 'in' },
  weight: { metric: 'kg', us: 'lb' },
};
const OTHER_UNIT: Record<Unit, Unit> = {
  cm: 'in',
  in: 'cm',
  kg: 'lb',
  lb: 'kg',
};

// shortcut: fixed adult bands decide when an unlabeled number is probably the other unit
// ("weigh 180" in metric); tune them if users report wrong unit questions.
const PLAUSIBLE: Record<Kind, { min: number; max: number }> = {
  height: { min: 130, max: 220 },
  weight: { min: 35, max: 150 },
};

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Value in cm or kg, rounded in the entered unit like the form does (ADR-0014 §2). */
const toBase = (value: number, unit: Unit) => {
  if (unit === 'in') return Math.round(value) * CM_PER_INCH;
  if (unit === 'lb') return lbToKg(round1(value));
  return round1(value);
};

/** cm or kg shown in the user's system: whole inches, else 0.1. */
const display = (base: number, kind: Kind, units: Units) =>
  kind === 'weight'
    ? weightFromKg(base, units)
    : units === 'us'
      ? Math.round(base / CM_PER_INCH)
      : round1(base);

const inBand = (base: number, kind: Kind) =>
  base >= PLAUSIBLE[kind].min && base <= PLAUSIBLE[kind].max;

type Measure = { value: number; unit: Unit | 'unspecified' };

/** Explicit unit → converted; unlabeled → the user's system, unless it only makes sense in the other one. */
const resolve = (m: Measure, kind: Kind, units: Units) => {
  if (m.unit !== 'unspecified') return { base: toBase(m.value, m.unit) };
  const own = SYSTEM_UNIT[kind][units];
  const base = toBase(m.value, own);
  const alt = toBase(m.value, OTHER_UNIT[own]);
  if (!inBand(base, kind) && inBand(alt, kind))
    return {
      check: {
        value: m.value,
        asUnit: OTHER_UNIT[own],
        converted: display(alt, kind, units),
      },
    };
  return { base };
};

export interface AdvanceResult {
  draft: InterviewDraft;
  state: InterviewState;
  messages: AssistantMessage[];
}

/**
 * One dialog step (ADR-0015 §3): checks what the model extracted, converts units,
 * updates the draft and decides what the user sees next. No model, no database.
 */
export function advanceInterview(
  draft: InterviewDraft,
  turn: InterviewTurn,
  { units, today }: { units: Units; today: string },
): AdvanceResult {
  const e = turn.extracted;
  const p: Profile = { ...draft.profile };
  let unknown = draft.unknown.slice();
  const notes: AssistantMessage[] = [];
  const ranges = unitRanges(units);

  const invalid = (field: InterviewField, range: object = {}) =>
    notes.push({ kind: 'invalid', field, ...range });

  /** Range-checked cm/kg for a measure, or null when it was reported back. */
  const measure = (field: MeasureField, kind: Kind, m: Measure) => {
    const r = resolve(m, kind, units);
    if (r.check) {
      notes.push({ kind: 'unit_check', field, ...r.check });
      return null;
    }
    if (profileSchema.shape[field].safeParse(r.base).success) return r.base;
    invalid(field, ranges[kind]);
    return null;
  };

  if (e.sex) p.sex = e.sex;

  const birthDate =
    e.birthDate ?? (e.ageYears != null ? addYears(today, -e.ageYears) : null);
  if (birthDate) {
    if (birthDateError(birthDate, today))
      invalid('birthDate', { min: addYears(today, -100), max: today });
    else p.birthDate = birthDate;
  }

  if (e.height)
    p.heightCm = measure('heightCm', 'height', e.height) ?? p.heightCm;
  if (e.weight)
    p.weightKg = measure('weightKg', 'weight', e.weight) ?? p.weightKg;
  if (e.activity) p.activity = e.activity;

  if (e.goal && e.goal !== p.goal) {
    // Target and deadline belong to the old goal.
    p.goal = e.goal;
    p.targetWeightKg = null;
    p.deadline = null;
    unknown = [];
  }

  if (e.targetWeight && (p.goal === 'lose' || p.goal === 'gain')) {
    if (e.targetWeight === 'unknown') {
      p.targetWeightKg = null;
      p.deadline = null;
      unknown = ['targetWeightKg'];
    } else {
      const kg = measure('targetWeightKg', 'weight', e.targetWeight);
      if (kg !== null) {
        p.targetWeightKg = kg;
        unknown = unknown.filter((f) => f !== 'targetWeightKg');
      }
    }
  }

  // On the result, not the new target only: a corrected weight can flip an earlier target too.
  if (targetWeightError(p)) {
    const weight = display(p.weightKg!, 'weight', units);
    invalid(
      'targetWeightKg',
      p.goal === 'lose' ? { max: weight } : { min: weight },
    );
    p.targetWeightKg = null;
    p.deadline = null;
  }

  // A deadline needs a target (profileSchema).
  if (e.deadline && p.targetWeightKg !== null) {
    if (e.deadline === 'unknown') {
      p.deadline = null;
      if (!unknown.includes('deadline')) unknown.push('deadline');
    } else if (deadlineError(e.deadline, today)) {
      invalid('deadline', { min: addDays(today, 14), max: addYears(today, 2) });
    } else {
      p.deadline = e.deadline;
      unknown = unknown.filter((f) => f !== 'deadline');
    }
  }

  const next: InterviewDraft = { ...draft, profile: p, unknown };
  const reply = (ask?: InterviewField): AssistantMessage =>
    ask
      ? { kind: 'text', text: turn.reply, ask }
      : { kind: 'text', text: turn.reply };
  const active = (...messages: AssistantMessage[]): AdvanceResult => ({
    draft: next,
    state: 'active',
    messages,
  });

  if (p.birthDate && ageYears(p.birthDate, today) < 18)
    return {
      draft: next,
      state: 'minor',
      messages: [reply(), { kind: 'minor' }],
    };
  if (notes.length) return active(reply(), ...notes);

  const ask = nextField(next);
  if (ask) return active(reply(ask));

  const norm = calculateNorm(p, today);
  if (norm.status !== 'ok') return active(reply());

  const pace = norm.pace;
  const paceKey = `${p.targetWeightKg}|${p.deadline}`;
  if (
    pace?.source === 'deadline' &&
    (pace.level === 'fast' || pace.level === 'danger') &&
    next.paceWarned !== paceKey
  ) {
    next.paceWarned = paceKey;
    return active(reply(), {
      kind: 'pace',
      level: pace.level,
      deadline: p.deadline!,
      safeDeadline: pace.safeDeadline,
    });
  }

  return {
    draft: next,
    state: 'summary',
    messages: [reply(), { kind: 'summary', draft: p, norm }],
  };
}

/** First missing field in question order; target and deadline only for lose/gain, "unknown" counts as answered. */
export function nextField({
  profile: p,
  unknown,
}: InterviewDraft): InterviewField | null {
  const required = REQUIRED_FIELDS.find((k) => p[k] === null);
  if (required) return required;
  if (p.goal === 'maintain') return null;
  if (p.targetWeightKg === null)
    return unknown.includes('targetWeightKg') ? null : 'targetWeightKg';
  if (p.deadline === null && !unknown.includes('deadline')) return 'deadline';
  return null;
}
