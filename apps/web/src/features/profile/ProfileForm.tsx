import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, Flag, Sparkles, Undo2 } from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import {
  DEFAULT_MANUAL_PCT,
  KCAL_FLOOR,
  REQUIRED_FIELDS,
  ageYears,
  birthDateError,
  calculateNorm,
  cmToFtIn,
  deadlineError,
  effectiveNorm,
  ftInToCm,
  goalSchema,
  manualNormSchema,
  targetWeightError,
  addDays,
  addYears,
  unitRanges,
  weightFromKg,
  weightToKg,
  type Goal,
  type ManualNorm,
  type Profile,
  type ProfileRequest,
  type ProfileResponse,
  type Sex,
  type Units,
} from '@oct/shared';
import { ApiError } from '../../api/client';
import { useDirty } from '../../app/dirty';
import { useT } from '../../i18n';
import { en } from '../../i18n/locales/en';
import type { Key } from '../../i18n/translate';
import { ActivitySheet } from '../../ui/ActivitySheet/ActivitySheet';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { Disclaimer } from '../../ui/Disclaimer/Disclaimer';
import { HowCalculated } from '../../ui/HowCalculated/HowCalculated';
import {
  FormRow,
  HeightFtIn,
  InlineDate,
  InlineNumber,
  PickValue,
  inchesError,
} from '../../ui/FormList/FormList';
import { List, ListRow } from '../../ui/List/List';
import { NormCard } from '../../ui/NormCard/NormCard';
import { SaveBar } from '../../ui/SaveBar/SaveBar';
import { Segment } from '../../ui/Segment/Segment';
import { Switch } from '../../ui/Switch/Switch';
import { useToast } from '../../ui/Toast/Toast';
import { MACROS, fillMacros, type Macro, type Pct } from './fillMacros';
import { MacroFillDialog } from './MacroFillDialog';
import './ProfileForm.css';

type Field = keyof Profile;
type FtIn = { ft: number | null; in: number | null };

const FIELDS: Field[] = [
  'sex',
  'birthDate',
  'heightCm',
  'weightKg',
  'activity',
  'goal',
  'targetWeightKg',
  'deadline',
];
const CALC_GROUP = new Set<Field>(REQUIRED_FIELDS.filter((f) => f !== 'goal'));

const LABEL: Record<Field, Key> = {
  sex: 'field.sex',
  birthDate: 'field.birth',
  heightCm: 'field.height',
  weightKg: 'field.weight',
  activity: 'activity.title',
  goal: 'goal.title',
  targetWeightKg: 'goal.target',
  deadline: 'goal.deadline',
};

// «Not now» on «Goal reached» (8.13) lasts until the profile changes.
const REACHED_LATER_KEY = 'oct.goalReached.laterRev';
const UNDO_MS = 5000;

const isLoseGain = (goal: Goal | null) => goal === 'lose' || goal === 'gain';

// The manual goal as typed: an emptied field is null (8.8).
type ManualDraft = { kcal: number | null } & Record<Macro, number | null>;
const toDraft = (m: ManualNorm | null): ManualDraft | null =>
  m && {
    kcal: m.kcal,
    protein: m.proteinPct,
    fat: m.fatPct,
    carbs: m.carbsPct,
  };
const toManual = (kcal: number, pct: Pct): ManualNorm => ({
  kcal,
  proteinPct: pct.protein,
  fatPct: pct.fat,
  carbsPct: pct.carbs,
});
const KCAL = manualNormSchema.shape.kcal;
const KCAL_PER_G: Pct = { protein: 4, fat: 9, carbs: 4 };

type Props = {
  initial: ProfileResponse;
  units: Units;
  /** Local date, YYYY-MM-DD: age, deadline and pace are counted from it. */
  today: string;
  /** Opens the assistant; absent when no AI is configured (8.2). */
  onAgent?: () => void;
  /** PUT /api/profile; throws ApiError. */
  onSave: (request: ProfileRequest) => Promise<ProfileResponse>;
  /** The account flag: the user closed the disclaimer once, for good (OCT-22 §1). */
  disclaimerHidden?: boolean;
  /** Sets that flag; works offline through the settings queue. */
  onHideDisclaimer?: () => void;
  /** Bump to turn the manual goal on and scroll to it («Set my own goal» in the chat, 9.8). */
  manualAt?: number;
  /** «Go to the form» from the chat: its filled fields become unsaved edits; a new `at` applies them. */
  agentDraft?: { profile: Profile | null; at: number };
  /** 8.14: the assistant was asked for but the AI doesn't answer. */
  agentUnavailable?: boolean;
  /** Offline (8.15): values only, no saving, the assistant greyed out; «How it’s calculated» still works. */
  readOnly?: boolean;
};

/** Profile screen body (OCT-22 §2, D.1): the form in rows, live norm, Save. */
export function ProfileForm({
  initial,
  units,
  today,
  onAgent,
  onSave,
  disclaimerHidden = false,
  onHideDisclaimer,
  manualAt,
  agentDraft,
  agentUnavailable = false,
  readOnly = false,
}: Props) {
  const { t, locale } = useT();
  const toast = useToast();
  const formRef = useRef<HTMLFieldSetElement>(null);
  const [saved, setSaved] = useState(initial);
  // Draft in cm and kg, unrounded (ADR-0014 §2): switching units only changes what is shown (E-1.9).
  const [draft, setDraft] = useState(initial.profile);
  // Feet and inches as typed, so «12″» stays visible as an error instead of becoming the next foot.
  const [ftIn, setFtIn] = useState<FtIn | null>(null);
  const [serverErrors, setServerErrors] = useState<
    Partial<Record<Field, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [laterRev, setLaterRev] = useState(() =>
    localStorage.getItem(REACHED_LATER_KEY),
  );
  const [disclaimerClosed, setDisclaimerClosed] = useState(false);
  const [manual, setManual] = useState(() => toDraft(initial.manual));
  // The rest goes to fat when carbs were edited last (8.8a).
  const lastEdited = useRef<Macro | null>(null);
  const [fillOpen, setFillOpen] = useState(false);
  const focusAfterFill = useRef<Macro | null>(null);
  const switchId = useId();
  const agentId = useId();
  // 8.20 opens as /profile?how: the form stays mounted, so the draft survives the trip.
  const how = new URLSearchParams(useSearch()).has('how');
  const [, navigate] = useLocation();
  const asideRef = useRef<HTMLDivElement>(null);
  const wasHow = useRef(how);

  useEffect(() => setFtIn(null), [units]);
  // Back from 8.20: focus returns to the row that opened it.
  useEffect(() => {
    if (wasHow.current && !how)
      asideRef.current?.querySelector<HTMLElement>('.norm-card__how')?.focus();
    wasHow.current = how;
  }, [how]);

  const set = <K extends Field>(field: K, value: Profile[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setServerErrors((e) => {
      const rest = { ...e };
      delete rest[field];
      return rest;
    });
  };

  // Target and deadline only count for lose / gain, a deadline only with a target (profileSchema).
  const hasTarget = isLoseGain(draft.goal);
  const profile: Profile = {
    ...draft,
    targetWeightKg: hasTarget ? draft.targetWeightKg : null,
    deadline:
      hasTarget && draft.targetWeightKg !== null ? draft.deadline : null,
  };
  const changed = (f: Field) => profile[f] !== saved.profile[f];
  const manualChanged =
    JSON.stringify(manual) !== JSON.stringify(toDraft(saved.manual));
  const dirty = FIELDS.some(changed) || manualChanged;

  // Errors in form order; range errors in the user's units (AC-1.4).
  const ranges = unitRanges(units);
  const num1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const weightUnit = t(units === 'us' ? 'unit.lb' : 'unit.kg');
  const ftInShown: FtIn =
    ftIn ??
    (profile.heightCm === null
      ? { ft: null, in: null }
      : cmToFtIn(profile.heightCm));
  const errors: Partial<Record<Field, string>> = {};
  const rangeError = (
    field: Field,
    value: number | null,
    { min, max }: { min: number; max: number },
    unit: string,
    format: (n: number) => string = num1.format,
  ) => {
    if (value !== null && (value < min || value > max))
      errors[field] = t('range.error', {
        field: t(LABEL[field]),
        min: format(min),
        max: format(max),
        unit,
      }).trim();
  };
  const codeError = (field: Field, code: string | null | false) => {
    if (code)
      errors[field] =
        code in en.profile.err
          ? t(`profile.err.${code as keyof typeof en.profile.err}`)
          : t('errors.validation_failed');
  };
  for (const field of FIELDS) {
    if (field === 'birthDate' && changed(field) && profile.birthDate)
      codeError(field, birthDateError(profile.birthDate, today));
    if (field === 'heightCm') {
      if (units === 'metric')
        rangeError(field, profile.heightCm, ranges.height, t('unit.cm'));
      else if (inchesError(ftInShown.in))
        errors.heightCm = `${t('field.height')}: ${t('range.inches')}`;
      else if (profile.heightCm !== null)
        rangeError(
          field,
          (ftInShown.ft ?? 0) * 12 + (ftInShown.in ?? 0),
          ranges.height,
          '',
          (n) => `${Math.floor(n / 12)}′ ${n % 12}″`,
        );
    }
    if (field === 'weightKg' || field === 'targetWeightKg') {
      const kg = profile[field];
      rangeError(
        field,
        kg === null ? null : weightFromKg(kg, units),
        ranges.weight,
        weightUnit,
      );
    }
    if (field === 'targetWeightKg' && !errors[field])
      codeError(
        field,
        (changed('goal') || changed(field)) && targetWeightError(profile),
      );
    if (field === 'deadline' && changed(field) && profile.deadline)
      codeError(field, deadlineError(profile.deadline, today));
    if (serverErrors[field] && !errors[field])
      codeError(field, serverErrors[field]);
  }
  const errorFields = Object.keys(errors) as Field[];

  // The manual goal: kcal and shares in range; a sum other than 100 is not an error (8.8).
  const pct: Pct | null = manual && {
    protein: manual.protein ?? 0,
    fat: manual.fat ?? 0,
    carbs: manual.carbs ?? 0,
  };
  const pctSum = pct ? pct.protein + pct.fat + pct.carbs : 100;
  let manualError: string | null = null;
  if (manual) {
    const bad = MACROS.find((m) => pct![m] > 100);
    if (manual.kcal !== null && !KCAL.safeParse(manual.kcal).success)
      manualError = t('range.error', {
        field: t('manual.kcal'),
        min: num1.format(KCAL.minValue!),
        max: num1.format(KCAL.maxValue!),
        unit: t('today.kcal'),
      });
    else if (bad)
      manualError = t('range.error', {
        field: t(`macro.${bad}`),
        min: 0,
        max: 100,
        unit: '%',
      });
  }
  const filled = pct && fillMacros(pct, lastEdited.current);
  // Only a sum of 100 is ever saved (AC-3.2).
  const manualRequest = (fill: boolean) =>
    manual && filled && toManual(manual.kcal!, fill ? filled.pct : pct!);
  // An empty kcal is not an error yet (8.1 style), but there is nothing to save.
  const manualEmpty = manual?.kcal === null;
  const blocked = errorFields.length > 0 || manualError !== null || manualEmpty;
  // «Save and leave» (8.19) can't save a draft with errors: it stays to show them.
  useDirty(dirty, () =>
    blocked
      ? Promise.resolve(false)
      : save({ profile, manual: manualRequest(true) }),
  );
  useEffect(() => {
    if (fillOpen || !focusAfterFill.current) return;
    formRef.current
      ?.querySelector<HTMLElement>(
        `input[aria-label="${t(`macro.${focusAfterFill.current}`)}"]`,
      )
      ?.focus();
    focusAfterFill.current = null;
  }, [fillOpen, t]);
  useEffect(() => {
    if (manualAt) openManual();
    // Only a new request opens it, not a re-render.
  }, [manualAt]);
  useEffect(() => {
    if (!agentDraft) return;
    // Only filled fields: an empty one in the chat must not wipe what the form has.
    const filled = Object.fromEntries(
      Object.entries(agentDraft.profile ?? {}).filter(([, v]) => v !== null),
    );
    const next = { ...draft, ...filled };
    setDraft(next);
    setFtIn(null);
    setStarted(true);
    // After the chat sheet has closed and handed focus back to its opener.
    const id = setTimeout(() => startForm(next));
    return () => clearTimeout(id);
  }, [agentDraft?.at]);
  const groupError = (calc: boolean) =>
    errorFields.find((f) => CALC_GROUP.has(f) === calc);

  // The norm: live from the draft (AC-1.2), the same function the server uses (ADR-0014 §4).
  const calc = errorFields.length ? null : calculateNorm(profile, today);
  const norm = manual
    ? manualError || manualEmpty
      ? null
      : effectiveNorm(profile, manualRequest(false), today)
    : calc?.status === 'ok'
      ? calc
      : null;
  const fieldName = (f: Field) => t(LABEL[f]).toLocaleLowerCase(locale);
  const firstVisit =
    !readOnly &&
    !started &&
    !dirty &&
    saved.manual === null &&
    FIELDS.every((f) => saved.profile[f] === null);

  const shortDate = (date: string) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(date));

  // Warnings of the calculated norm (8.5b, 8.6, 8.11); they never block saving.
  const ok = calc?.status === 'ok' && !manual ? calc : null;
  let warnings: ReactNode = null;
  if (ok) {
    const { pace, steps } = ok;
    const level = pace?.level ?? 'ok';
    // Dates use non-breaking spaces so "21 Feb" never wraps mid-date.
    const body = [
      level === 'gain_fast'
        ? pace?.source === 'deadline' && profile.deadline && pace.etaDate
          ? t('pace.gain_fast_capped', {
              date: shortDate(profile.deadline).replaceAll(' ', '\u00a0'),
              eta: shortDate(pace.etaDate).replaceAll(' ', '\u00a0'),
            })
          : t('pace.gain_fast')
        : level !== 'ok' && t(`pace.${level}.body`),
      steps.floor === 'tdee_below_floor' && t('floor.tdee'),
      steps.floor === 'clamped' &&
        (pace?.source === 'deadline' && profile.deadline && pace.etaDate
          ? t('floor.clamped', {
              date: shortDate(profile.deadline).replaceAll(' ', '\u00a0'),
              eta: shortDate(pace.etaDate).replaceAll(' ', '\u00a0'),
            })
          : t('floor.capped')),
    ]
      .filter(Boolean)
      .join(' ');
    // A date past the 2-year limit would only turn into a field error.
    const safeDeadline =
      pace?.safeDeadline && !deadlineError(pace.safeDeadline, today)
        ? pace.safeDeadline
        : null;
    warnings = (
      <>
        {body && (
          <Banner
            tone="warning"
            title={
              level === 'danger'
                ? t('pace.danger.title')
                : level !== 'ok' && t('pace.fast.title')
            }
            actions={
              safeDeadline && (
                <button
                  type="button"
                  onClick={() => set('deadline', safeDeadline)}
                >
                  {t('pace.postpone')}
                </button>
              )
            }
          >
            {body}
          </Banner>
        )}
        {ok.warnings.map(
          (w) =>
            w !== 'goal_reached' && (
              <Banner
                key={w}
                tone="warning"
                title={t(w === 'bmi_check' ? 'bmi.check' : 'bmi.risk')}
              />
            ),
        )}
      </>
    );
  }

  // 8.13: offer «Maintain» once the target is reached, until «Not now» for this profile rev.
  let reached: ReactNode = null;
  if (
    ok?.warnings.includes('goal_reached') &&
    profile.targetWeightKg !== null &&
    laterRev !== String(saved.rev)
  ) {
    const maintain: Profile = {
      ...profile,
      goal: 'maintain',
      targetWeightKg: null,
      deadline: null,
    };
    const next = calculateNorm(maintain, today);
    const before = saved;
    reached = (
      <Banner
        tone="accent"
        title={t('reached.title', {
          weight: `${num1.format(weightFromKg(profile.targetWeightKg, units))} ${weightUnit}`,
        })}
        icon={<Flag aria-hidden="true" />}
        actions={
          <>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                save({ profile: maintain, manual: saved.manual }, () =>
                  save({ profile: before.profile, manual: before.manual }),
                )
              }
            >
              {t('reached.go')}
            </button>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem(REACHED_LATER_KEY, String(saved.rev));
                setLaterRev(String(saved.rev));
              }}
            >
              {t('reached.later')}
            </button>
          </>
        }
      >
        {next.status === 'ok' &&
          t('reached.body', {
            n: new Intl.NumberFormat(locale).format(next.kcal),
          })}
      </Banner>
    );
  }

  const minor = calc?.status === 'minor';
  // Why there is no calculation: a field to fix, under 18, or what is missing.
  const emptyMessage = (missingKey: 'norm.missing' | 'how.missing') =>
    manual && missingKey === 'norm.missing'
      ? t(manualEmpty ? 'norm.missing' : 'norm.fix', {
          field: t('manual.kcal').toLocaleLowerCase(locale),
          fields: t('manual.kcal').toLocaleLowerCase(locale),
        })
      : errorFields[0]
        ? t('norm.fix', { field: fieldName(errorFields[0]) })
        : minor
          ? t('norm.minor')
          : t(missingKey, {
              fields: new Intl.ListFormat(locale, {
                type: 'conjunction',
              }).format(
                calc?.status === 'incomplete'
                  ? calc.missing.map(fieldName)
                  : [],
              ),
            });
  let card: ReactNode;
  if (firstVisit)
    card = (
      <NormCard state="first" onAgent={onAgent} onForm={() => startForm()} />
    );
  else if (norm)
    card = (
      <NormCard
        state="norm"
        norm={{
          kcal: norm.kcal,
          protein: norm.proteinG,
          fat: norm.fatG,
          carbs: norm.carbsG,
        }}
        badge={
          manual
            ? manualChanged
              ? 'draft'
              : 'manual'
            : dirty
              ? 'draft'
              : 'calc'
        }
        onHow={() => navigate('/profile?how')}
      >
        {warnings}
        {saved.manual && manual && !manualChanged && (
          // 8.9: the calculation for comparison and one tap back to it (AC-3.5, AC-3.6).
          <div className="profile__override">
            {calc?.status === 'ok' && (
              <span>
                {t('manual.by_profile', {
                  n: new Intl.NumberFormat(locale).format(calc.kcal),
                })}
              </span>
            )}
            <Button
              variant="plain"
              small
              disabled={saving || errorFields.length > 0 || readOnly}
              onClick={resetToCalc}
            >
              <Undo2 aria-hidden="true" />
              {t('manual.reset')}
            </Button>
          </div>
        )}
      </NormCard>
    );
  else
    card = (
      <NormCard state="empty" message={emptyMessage('norm.missing')}>
        {minor && !manual && (
          <>
            <p>{t('norm.minor_body')}</p>
            <Button variant="tonal" onClick={openManual}>
              {t('norm.minor_cta')}
            </Button>
          </>
        )}
      </NormCard>
    );

  // The disclaimer can be closed once a norm was saved, never for under-18s (OCT-22 §1).
  const showDisclaimer = minor || !(disclaimerHidden || disclaimerClosed);
  const canHideDisclaimer =
    !minor &&
    !!onHideDisclaimer &&
    effectiveNorm(saved.profile, saved.manual, today) !== null;
  const hideDisclaimer = () => {
    setDisclaimerClosed(true);
    onHideDisclaimer?.();
    // 8.21: focus moves to «Set up with the assistant», or to the form without it.
    (
      document.getElementById(agentId) ??
      formRef.current?.querySelector<HTMLElement>(
        '[tabindex="0"], input, button',
      )
    )?.focus();
  };

  // Pace under the goal group (OCT-22 §2).
  const pace = calc?.status === 'ok' ? calc.pace : null;
  // The « · by Mar 1» tail stays on one line.
  const keepTail = (text: string) => {
    const i = text.lastIndexOf(' · ');
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}{' '}
        <span className="profile__nowrap">{text.slice(i + 1)}</span>
      </>
    );
  };
  let paceText: ReactNode = null;
  if (pace && hasTarget) {
    const params = {
      x: `${num1.format(weightFromKg(pace.kgPerWeek, units))} ${weightUnit}`,
      p: num1.format(pace.pctPerWeek),
    };
    if (pace.deadlineOverdue)
      paceText = <span className="profile__warn">{t('goal.overdue')}</span>;
    else if (pace.source === 'deadline' && profile.deadline)
      paceText = keepTail(
        t('goal.pace', { ...params, date: shortDate(profile.deadline) }),
      );
    else if (pace.etaDate)
      paceText = keepTail(
        t('goal.eta', { ...params, date: shortDate(pace.etaDate) }),
      );
    else paceText = t('goal.rate', params);
  }
  // Under the manual group: an error, else the sum hint and the low-kcal warning (8.8).
  const floor = KCAL_FLOOR[profile.sex ?? 'male'];
  let manualFooter: ReactNode = t('manual.hint');
  if (manualError)
    manualFooter = <span className="profile__error">{manualError}</span>;
  else if (manual)
    manualFooter = (pctSum !== 100 || (manual.kcal ?? floor) < floor) && (
      <>
        {pctSum !== 100 && (
          <span className="profile__line">
            {t(pctSum < 100 ? 'manual.sum_short' : 'manual.sum_over', {
              n: Math.abs(100 - pctSum),
            })}
          </span>
        )}
        {(manual.kcal ?? floor) < floor && (
          <span className="profile__line profile__warn">
            {t('manual.low', {
              floor: new Intl.NumberFormat(locale).format(floor),
            })}{' '}
            {t('norm.disclaimer')}
          </span>
        )}
      </>
    );
  const footerError = (f: Field | undefined) =>
    f && <span className="profile__error">{errors[f]}</span>;

  function setManualField(field: keyof ManualDraft, value: number | null) {
    if (field !== 'kcal') lastEdited.current = field;
    setManual((m) => m && { ...m, [field]: value });
  }

  /** Switch on: the saved manual goal, else the current calculation's shares (AC-3.2). */
  function turnManual(on: boolean) {
    if (!on) return setManual(null);
    lastEdited.current = null;
    if (saved.manual) return setManual(toDraft(saved.manual));
    if (calc?.status !== 'ok')
      return setManual({ kcal: null, ...DEFAULT_MANUAL_PCT });
    const protein = Math.round((calc.proteinG * 400) / calc.kcal);
    const fat = Math.round((calc.fatG * 900) / calc.kcal);
    setManual({ kcal: calc.kcal, protein, fat, carbs: 100 - protein - fat });
  }

  /** «Set manually» (8.12, 9.8): switch on and bring it into view. */
  function openManual() {
    if (!manual) turnManual(true);
    const el = document.getElementById(switchId);
    el?.scrollIntoView?.({ block: 'center' });
    el?.focus();
  }

  /** 8.10: no dialog, «Undo» brings the manual goal back. */
  function resetToCalc() {
    const before = saved.manual;
    void save(
      { profile, manual: null },
      () => save({ profile, manual: before }),
      t('manual.reset_toast'),
    );
  }

  function onSaveClick() {
    if (manual && pctSum !== 100) setFillOpen(true);
    else void save();
  }

  function startForm(from: Profile = draft) {
    setStarted(true);
    const first = REQUIRED_FIELDS.find((f) => from[f] === null);
    if (!first) return;
    if (first === 'activity') return setActivityOpen(true);
    const label = t(LABEL[first]);
    const el = formRef.current?.querySelector<HTMLElement>(
      first === 'sex' || first === 'goal'
        ? `[role="radiogroup"][aria-label="${label}"] [tabindex="0"]`
        : `input[aria-label^="${label}"]`,
    );
    el?.scrollIntoView?.({ block: 'center' });
    el?.focus();
  }

  /** PUT the draft, or `request`; `undo` adds «Undo» to the toast (8.10, 8.13). */
  async function save(
    request: ProfileRequest = { profile, manual: manualRequest(false) },
    undo?: () => void,
    text = t('save.done'),
  ) {
    setSaving(true);
    setFailed(false);
    try {
      const res = await onSave(request);
      setSaved(res);
      setDraft(res.profile);
      setManual(toDraft(res.manual));
      setFtIn(null);
      toast(
        undo
          ? {
              text,
              action: { label: t('common.undo'), onClick: undo },
              ms: UNDO_MS,
            }
          : { text },
      );
      return true;
    } catch (err) {
      // A field the server rejected is shown at the field (8.17); anything else is a banner.
      const fields: Partial<Record<Field, string>> = {};
      if (err instanceof ApiError && Array.isArray(err.details))
        for (const d of err.details as { path?: unknown[]; code?: string }[]) {
          const f = d.path?.[1] as Field;
          if (d.path?.[0] === 'profile' && FIELDS.includes(f))
            fields[f] = d.code ?? '';
        }
      if (Object.keys(fields).length) setServerErrors(fields);
      else setFailed(true);
      return false;
    } finally {
      setSaving(false);
    }
  }

  const goal = profile.goal;
  return (
    <>
      {how && (
        <HowCalculated
          units={units}
          manualKcal={saved.manual?.kcal}
          {...(calc?.status === 'ok'
            ? { profile, norm: calc }
            : { message: emptyMessage('how.missing') })}
        />
      )}
      <div className={`profile${dirty ? ' profile--dirty' : ''}`} hidden={how}>
        <div className="profile__aside" ref={asideRef}>
          {reached}
          {card}
          {showDisclaimer && (
            <Disclaimer
              onHide={canHideDisclaimer ? hideDisclaimer : undefined}
            />
          )}
          {onAgent && !firstVisit && !minor && (
            <Button
              id={agentId}
              variant="tonal"
              onClick={onAgent}
              disabled={readOnly}
              aria-describedby={readOnly ? `${agentId}-why` : undefined}
            >
              <Sparkles aria-hidden="true" />
              {t('agent.cta')}
            </Button>
          )}
          {onAgent && !firstVisit && !minor && readOnly && (
            <p id={`${agentId}-why`} className="profile__offline">
              {t('offline.blocked.agent')}
            </p>
          )}
          {agentUnavailable && (
            <Banner title={t('agent.unavailable')}>
              {t('agent.unavailable_body')}
            </Banner>
          )}
          {failed && (
            <Banner tone="danger" title={t('save.error')}>
              {t('save.error_body')}{' '}
              <button
                type="button"
                className="profile__link"
                onClick={onSaveClick}
              >
                {t('common.retry')}
              </button>
            </Banner>
          )}
          {!readOnly && (
            <div className={dirty ? undefined : 'profile__save--idle'}>
              <SaveBar
                preview={
                  norm
                    ? `${new Intl.NumberFormat(locale).format(norm.kcal)} ${t('today.kcal')}`
                    : null
                }
                onSave={onSaveClick}
                disabled={!dirty || blocked}
                loading={saving}
              />
            </div>
          )}
        </div>

        {/* Offline the native disabled reaches every field, the switch and the activity row. */}
        <fieldset className="profile__form" ref={formRef} disabled={readOnly}>
          <List
            title={t('profile.calc')}
            footer={footerError(groupError(true)) ?? t('field.sex_hint')}
          >
            <FormRow label={t('field.sex')} stacked>
              <Segment
                label={t('field.sex')}
                options={[
                  { value: 'male', label: t('field.male') },
                  { value: 'female', label: t('field.female') },
                ]}
                value={profile.sex ?? ('' as Sex)}
                onChange={(v) => set('sex', v)}
              />
            </FormRow>
            <FormRow label={t('field.birth')}>
              <InlineDate
                label={t('field.birth')}
                value={profile.birthDate}
                onChange={(v) => set('birthDate', v)}
                suffix={
                  profile.birthDate && profile.birthDate <= today
                    ? t('field.age', {
                        count: ageYears(profile.birthDate, today),
                      })
                    : undefined
                }
                max={today}
                error={!!errors.birthDate}
                readOnly={readOnly}
              />
            </FormRow>
            <FormRow label={t('field.height')}>
              {units === 'us' ? (
                <HeightFtIn
                  label={t('field.height')}
                  value={ftInShown}
                  onChange={(v) => {
                    setFtIn(v);
                    set(
                      'heightCm',
                      v.ft === null && v.in === null
                        ? null
                        : ftInToCm(v.ft ?? 0, v.in ?? 0),
                    );
                  }}
                  error={!!errors.heightCm && !inchesError(ftInShown.in)}
                  readOnly={readOnly}
                />
              ) : (
                <InlineNumber
                  label={t('field.height')}
                  value={
                    profile.heightCm === null
                      ? null
                      : Math.round(profile.heightCm)
                  }
                  onChange={(v) => set('heightCm', v)}
                  unit={t('unit.cm')}
                  error={!!errors.heightCm}
                  readOnly={readOnly}
                />
              )}
            </FormRow>
            <FormRow label={t('field.weight')}>
              <InlineNumber
                label={t('field.weight')}
                value={
                  profile.weightKg === null
                    ? null
                    : weightFromKg(profile.weightKg, units)
                }
                onChange={(v) =>
                  set('weightKg', v === null ? null : weightToKg(v, units))
                }
                unit={weightUnit}
                decimals={1}
                error={!!errors.weightKg}
                readOnly={readOnly}
              />
            </FormRow>
            <ListRow
              value={
                <PickValue
                  value={
                    profile.activity && t(`activity.${profile.activity}.name`)
                  }
                />
              }
              description={
                profile.activity && t(`activity.${profile.activity}.desc`)
              }
              onClick={() => setActivityOpen(true)}
              chevron={!readOnly}
            >
              {t('activity.title')}
            </ListRow>
          </List>

          <List
            title={t('goal.title')}
            footer={footerError(groupError(false)) ?? paceText}
          >
            <li className="list__item">
              <div className="list-row form-row--stacked">
                <Segment
                  label={t('goal.title')}
                  options={goalSchema.options.map((g) => ({
                    value: g,
                    label: t(`goal.${g}`),
                  }))}
                  value={goal ?? ('' as Goal)}
                  onChange={(v) => set('goal', v)}
                />
              </div>
            </li>
            {isLoseGain(goal) && (
              <>
                <FormRow label={t('goal.target')}>
                  <InlineNumber
                    label={t('goal.target')}
                    value={
                      profile.targetWeightKg === null
                        ? null
                        : weightFromKg(profile.targetWeightKg, units)
                    }
                    onChange={(v) =>
                      set(
                        'targetWeightKg',
                        v === null ? null : weightToKg(v, units),
                      )
                    }
                    unit={weightUnit}
                    decimals={1}
                    placeholder={t('field.optional')}
                    error={!!errors.targetWeightKg}
                    readOnly={readOnly}
                  />
                </FormRow>
                <FormRow label={t('goal.deadline')}>
                  <InlineDate
                    label={t('goal.deadline')}
                    value={profile.deadline}
                    onChange={(v) => set('deadline', v)}
                    placeholder={t(
                      profile.targetWeightKg === null
                        ? 'goal.deadline_needs_target'
                        : 'field.optional',
                    )}
                    min={addDays(today, 14)}
                    max={addYears(today, 2)}
                    readOnly={readOnly || profile.targetWeightKg === null}
                    error={!!errors.deadline}
                  />
                </FormRow>
              </>
            )}
          </List>

          <List title={t('manual.title')} footer={manualFooter}>
            <FormRow label={t('manual.toggle')}>
              <Switch
                id={switchId}
                checked={manual !== null}
                onChange={turnManual}
                label={t('manual.toggle')}
              />
            </FormRow>
            {manual && (
              <>
                <FormRow label={t('manual.kcal')}>
                  <InlineNumber
                    label={t('manual.kcal')}
                    value={manual.kcal}
                    onChange={(v) => setManualField('kcal', v)}
                    unit={t('today.kcal')}
                    error={
                      manualError !== null && !MACROS.some((m) => pct![m] > 100)
                    }
                    readOnly={readOnly}
                  />
                </FormRow>
                {MACROS.map((m) => (
                  <FormRow
                    key={m}
                    label={
                      <>
                        <span
                          className={`profile__dot profile__dot--${m}`}
                          aria-hidden="true"
                        />
                        {t(`macro.${m}`)}
                      </>
                    }
                  >
                    <span className="profile__pct">
                      {manual.kcal !== null && (
                        <span className="profile__grams">
                          {Math.round(
                            (manual.kcal * pct![m]) / 100 / KCAL_PER_G[m],
                          )}{' '}
                          {t('macro.g')}
                        </span>
                      )}
                      <InlineNumber
                        label={t(`macro.${m}`)}
                        value={manual[m]}
                        onChange={(v) => setManualField(m, v)}
                        unit="%"
                        error={pct![m] > 100}
                        readOnly={readOnly}
                      />
                    </span>
                  </FormRow>
                ))}
                <ListRow
                  value={
                    <span
                      className={`profile__sum${pctSum === 100 ? ' profile__sum--ok' : ''}`}
                    >
                      {pctSum === 100 && <Check aria-hidden="true" />}
                      {t('manual.pct', { n: pctSum })}
                    </span>
                  }
                >
                  {t('manual.sum')}
                </ListRow>
              </>
            )}
          </List>
        </fieldset>

        {manual && filled && (
          <MacroFillDialog
            open={fillOpen}
            pct={pct!}
            filled={filled.pct}
            target={filled.target}
            onApply={() => {
              setFillOpen(false);
              void save({ profile, manual: manualRequest(true) });
            }}
            onSelf={() => {
              focusAfterFill.current = filled.target;
              setFillOpen(false);
            }}
          />
        )}

        <ActivitySheet
          open={activityOpen}
          value={profile.activity}
          onSelect={(v) => {
            set('activity', v);
            setActivityOpen(false);
          }}
          onClose={() => setActivityOpen(false)}
        />
      </div>
    </>
  );
}
