import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import {
  REQUIRED_FIELDS,
  ageYears,
  birthDateError,
  calculateNorm,
  cmToFtIn,
  deadlineError,
  effectiveNorm,
  ftInToCm,
  goalSchema,
  targetWeightError,
  addDays,
  addYears,
  unitRanges,
  weightFromKg,
  weightToKg,
  type Goal,
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
import { useToast } from '../../ui/Toast/Toast';
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
}: Props) {
  const { t, locale } = useT();
  const toast = useToast();
  const formRef = useRef<HTMLDivElement>(null);
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
  const agentId = useId();

  useEffect(() => setFtIn(null), [units]);

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
  const dirty = FIELDS.some(changed);

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
  // «Save and leave» (8.19) can't save a draft with errors: it stays to show them.
  useDirty(dirty, () => (errorFields.length ? Promise.resolve(false) : save()));
  const groupError = (calc: boolean) =>
    errorFields.find((f) => CALC_GROUP.has(f) === calc);

  // The norm: live from the draft (AC-1.2), the same function the server uses (ADR-0014 §4).
  const calc = errorFields.length ? null : calculateNorm(profile, today);
  const norm = saved.manual
    ? effectiveNorm(profile, saved.manual, today)
    : calc?.status === 'ok'
      ? calc
      : null;
  const fieldName = (f: Field) => t(LABEL[f]).toLocaleLowerCase(locale);
  const firstVisit =
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
  const ok = calc?.status === 'ok' && !saved.manual ? calc : null;
  let warnings: ReactNode = null;
  if (ok) {
    const { pace, steps } = ok;
    const level = pace?.level ?? 'ok';
    const body = [
      level === 'gain_fast'
        ? t('pace.gain_fast')
        : level !== 'ok' && t(`pace.${level}.body`),
      steps.floor === 'tdee_below_floor' && t('floor.tdee'),
      steps.floor === 'clamped' &&
        (pace?.source === 'deadline' && profile.deadline && pace.etaDate
          ? t('floor.clamped', {
              date: shortDate(profile.deadline),
              eta: shortDate(pace.etaDate),
            })
          : t('floor.capped')),
    ]
      .filter(Boolean)
      .join(' ');
    const safeDeadline = pace?.safeDeadline;
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
          >
            {body}
            {safeDeadline && (
              <>
                {' '}
                <button
                  type="button"
                  className="profile__link"
                  onClick={() => set('deadline', safeDeadline)}
                >
                  {t('pace.postpone')}
                </button>
              </>
            )}
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
      >
        {next.status === 'ok' &&
          t('reached.body', {
            n: new Intl.NumberFormat(locale).format(next.kcal),
          })}{' '}
        <button
          type="button"
          className="profile__link"
          disabled={saving}
          onClick={() =>
            save({ profile: maintain, manual: saved.manual }, () =>
              save({ profile: before.profile, manual: before.manual }),
            )
          }
        >
          {t('reached.go')}
        </button>{' '}
        <button
          type="button"
          className="profile__link"
          onClick={() => {
            localStorage.setItem(REACHED_LATER_KEY, String(saved.rev));
            setLaterRev(String(saved.rev));
          }}
        >
          {t('reached.later')}
        </button>
      </Banner>
    );
  }

  const minor = calc?.status === 'minor';
  let card: ReactNode;
  if (firstVisit)
    card = <NormCard state="first" onAgent={onAgent} onForm={startForm} />;
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
        badge={saved.manual ? 'manual' : dirty ? 'draft' : 'calc'}
        // shortcut: «How it's calculated» is OCT-89; the row does nothing until then.
        onHow={() => {}}
      >
        {warnings}
      </NormCard>
    );
  else
    card = (
      <NormCard
        state="empty"
        message={
          errorFields[0]
            ? t('norm.fix', { field: fieldName(errorFields[0]) })
            : minor
              ? t('norm.minor')
              : t('norm.missing', {
                  fields: new Intl.ListFormat(locale, {
                    type: 'conjunction',
                  }).format(
                    calc?.status === 'incomplete'
                      ? calc.missing.map(fieldName)
                      : [],
                  ),
                })
        }
      >
        {minor && <p>{t('norm.minor_body')}</p>}
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
  const footerError = (f: Field | undefined) =>
    f && <span className="profile__error">{errors[f]}</span>;

  function startForm() {
    setStarted(true);
    const first = REQUIRED_FIELDS.find((f) => draft[f] === null);
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

  /** PUT the draft, or `request`; `undo` adds «Undo» to the toast (8.13). */
  async function save(
    request: ProfileRequest = { profile, manual: saved.manual },
    undo?: () => void,
  ) {
    setSaving(true);
    setFailed(false);
    try {
      const res = await onSave(request);
      setSaved(res);
      setDraft(res.profile);
      setFtIn(null);
      toast(
        undo
          ? {
              text: t('save.done'),
              action: { label: t('common.undo'), onClick: undo },
              ms: UNDO_MS,
            }
          : { text: t('save.done') },
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
    <div className={`profile${dirty ? ' profile--dirty' : ''}`}>
      <div className="profile__aside">
        {reached}
        {card}
        {showDisclaimer && (
          <Disclaimer onHide={canHideDisclaimer ? hideDisclaimer : undefined} />
        )}
        {onAgent && !firstVisit && !minor && (
          <Button id={agentId} variant="tonal" onClick={onAgent}>
            <Sparkles aria-hidden="true" />
            {t('agent.cta')}
          </Button>
        )}
        {failed && (
          <Banner tone="danger" title={t('save.error')}>
            {t('save.error_body')}{' '}
            <button
              type="button"
              className="profile__link"
              onClick={() => save()}
            >
              {t('common.retry')}
            </button>
          </Banner>
        )}
        <div className={dirty ? undefined : 'profile__save--idle'}>
          <SaveBar
            preview={
              norm
                ? `${new Intl.NumberFormat(locale).format(norm.kcal)} ${t('today.kcal')}`
                : null
            }
            onSave={() => save()}
            disabled={!dirty || errorFields.length > 0}
            loading={saving}
          />
        </div>
      </div>

      <div className="profile__form" ref={formRef}>
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
                  readOnly={profile.targetWeightKg === null}
                  error={!!errors.deadline}
                />
              </FormRow>
            </>
          )}
        </List>
      </div>

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
  );
}
