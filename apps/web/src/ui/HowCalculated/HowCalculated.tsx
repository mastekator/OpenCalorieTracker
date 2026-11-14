import { useEffect, useRef, type ReactNode } from 'react';
import {
  KCAL_FLOOR,
  KCAL_PER_KG,
  cmToFtIn,
  weightFromKg,
  type NormResult,
  type Profile,
  type Units,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Banner } from '../Banner/Banner';
import './HowCalculated.css';

type Calculated = Extract<NormResult, { status: 'ok' }>;

type Props = {
  units: Units;
  /** The manual goal in force, shown above the calculation for comparison (AC-2.4c). */
  manualKcal?: number | null;
} & (
  | { profile: Profile; norm: Calculated }
  /** No calculation: what to fill in or fix. */
  | { message: string }
);

// Verified links only (OCT-89); McArdle has none.
const SOURCES: { title: string; href?: string }[] = [
  {
    title:
      'Mifflin M. D., St Jeor S. T. et al. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51(2):241–247',
    href: 'https://doi.org/10.1093/ajcn/51.2.241',
  },
  {
    title:
      'Frankenfield D. et al. Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review. J Am Diet Assoc. 2005;105(5):775–789',
    href: 'https://doi.org/10.1016/j.jada.2005.02.005',
  },
  {
    title: 'FAO/WHO/UNU. Human energy requirements. 2004',
    href: 'https://www.fao.org/4/y5686e/y5686e00.htm',
  },
  { title: 'McArdle W. D., Katch F. I., Katch V. L. Exercise Physiology' },
  {
    title:
      'Hall K. D. et al. Quantification of the effect of energy imbalance on bodyweight. Lancet. 2011;378(9793):826–837',
    href: 'https://doi.org/10.1016/S0140-6736(11)60812-X',
  },
  {
    title:
      'Helms E. R. et al. Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. JISSN. 2014;11:20',
    href: 'https://doi.org/10.1186/1550-2783-11-20',
  },
  {
    title:
      'Roberts B. M., Helms E. R. et al. Nutritional recommendations for physique athletes. J Hum Kinet. 2020;71:79–108',
    href: 'https://doi.org/10.2478/hukin-2019-0096',
  },
  {
    title:
      'Turocy P. S. et al. NATA position statement: safe weight loss and maintenance practices in sport and exercise. J Athl Train. 2011;46(3):322–336',
    href: 'https://doi.org/10.4085/1062-6050-46.3.322',
  },
  {
    title:
      'Iraki J. et al. Nutrition recommendations for bodybuilders in the off-season. Sports. 2019;7(7):154',
    href: 'https://doi.org/10.3390/sports7070154',
  },
  {
    title:
      'NIH/NHLBI. Clinical Guidelines on the Identification, Evaluation, and Treatment of Overweight and Obesity in Adults. 1998',
    href: 'https://www.nhlbi.nih.gov/files/docs/guidelines/ob_gdlns.pdf',
  },
  {
    title:
      'Morton R. W. et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength. Br J Sports Med. 2018;52(6):376–384',
    href: 'https://doi.org/10.1136/bjsports-2017-097608',
  },
  {
    title:
      'Jäger R. et al. ISSN Position Stand: protein and exercise. JISSN. 2017;14:20',
    href: 'https://doi.org/10.1186/s12970-017-0177-8',
  },
  {
    title:
      'Institute of Medicine. Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids. 2005',
    href: 'https://doi.org/10.17226/10490',
  },
  {
    title: 'WHO. Healthy diet. Fact sheet',
    href: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
  },
  {
    title: 'WHO. Body mass index (BMI)',
    href: 'https://www.who.int/data/gho/data/themes/topics/topic-details/GHO/body-mass-index',
  },
];

/**
 * 8.20 «How it's calculated» (product OCT-5 §2.7): the user's own numbers, step by step,
 * straight from calculateNorm — nothing is recalculated here (AC-2.4b).
 */
export function HowCalculated(props: Props) {
  const { t, locale } = useT();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  // A real minus sign (U+2212), like the ones in the formulas.
  const fmt = (n: number, digits = 0) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits })
      .format(n)
      .replace('-', '−');
  const kcal = (n: number) => t('how.kcal', { n: fmt(n) });

  let body: ReactNode;
  if ('message' in props)
    body = <p className="how__message">{props.message}</p>;
  else {
    const { profile, norm } = props;
    const { steps, pace } = norm;
    const sex = profile.sex ?? 'male';
    const weight = profile.weightKg ?? 0;
    const height = profile.heightCm ?? 0;
    const goal = profile.goal === 'gain' ? 'gain' : 'lose';
    const min = KCAL_FLOOR[sex];
    const eq = (expr: string, result: number, tail?: ReactNode) => (
      <>
        {expr} = <strong>{kcal(result)}</strong>
        {tail}
      </>
    );
    const { ft, in: inch } = cmToFtIn(height);

    const items: { title: string; text: ReactNode }[] = [
      {
        title: t('how.bmr.title'),
        text: (
          <>
            {props.units === 'us' && (
              <span className="how__convert">
                {t('how.convert', {
                  ftin: `${ft}′ ${inch}″`,
                  cm: fmt(height, 1),
                  lb: fmt(weightFromKg(weight, 'us'), 1),
                  kg: fmt(weight, 1),
                })}
              </span>
            )}
            {t('how.bmr.body')}{' '}
            {eq(
              `10 × ${fmt(weight, 1)} + ${fmt(6.25, 2)} × ${fmt(height, 1)} − 5 × ${steps.ageYears} ${sex === 'male' ? '+ 5' : '− 161'}`,
              steps.bmr,
            )}
          </>
        ),
      },
      {
        title: t('how.tdee.title'),
        text: (
          <>
            {t('how.tdee.body', {
              level: t(`activity.${profile.activity ?? 'minimal'}.name`),
            })}{' '}
            {eq(
              `${fmt(steps.bmr)} × ${fmt(steps.activityFactor, 3)}`,
              steps.tdee,
            )}
            . {t('how.tdee.after')}
          </>
        ),
      },
    ];

    if (pace) {
      const unit = t(props.units === 'us' ? 'unit.lb' : 'unit.kg');
      const mass = (kg: number) =>
        `${fmt(weightFromKg(kg, props.units), 1)}\u00a0${unit}`;
      const rate = mass(pace.kgPerWeek);
      const intro =
        pace.source === 'deadline' &&
        profile.targetWeightKg !== null &&
        profile.deadline
          ? t(`how.goal.deadline_${goal}`, {
              kg: mass(Math.abs(weight - profile.targetWeightKg)),
              date: new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              }).format(new Date(profile.deadline)),
              rate,
            })
          : t(`how.goal.default_${goal}`, {
              p: fmt(pace.pctPerWeek, 2),
              rate,
            });
      const delta = Math.abs(steps.deltaKcal);
      items.push({
        title: t('how.goal.title'),
        text: (
          <>
            {intro}{' '}
            {t(`how.goal.energy_${goal}`, {
              perKg: fmt(KCAL_PER_KG),
              d: fmt(delta),
            })}{' '}
            {eq(
              `${fmt(steps.tdee)} ${goal === 'gain' ? '+' : '−'} ${fmt(delta)}`,
              steps.beforeFloor,
            )}
            {pace.level !== 'ok' && (
              <>
                .{' '}
                <span className="how__warn">{t(`how.goal.${pace.level}`)}</span>
              </>
            )}
          </>
        ),
      });
    }

    if (steps.floor)
      items.push({
        title: t('how.floor.title'),
        text: (
          <>
            {t(`how.floor.${steps.floor}`, {
              female: fmt(KCAL_FLOOR.female),
              male: fmt(KCAL_FLOOR.male),
            })}{' '}
            {fmt(steps.floor === 'clamped' ? steps.beforeFloor : steps.tdee)}{' '}
            {'<'} {fmt(min)} →{' '}
            <strong>
              {kcal(steps.floor === 'clamped' ? min : steps.tdee)}
            </strong>
          </>
        ),
      });

    items.push({
      title: t('how.macros.title'),
      text: (
        <>
          {t('how.macros.body')}{' '}
          <strong>
            {t('how.macros.calc', {
              p: norm.proteinG,
              f: norm.fatG,
              c: norm.carbsG,
            })}
          </strong>
        </>
      ),
    });

    body = (
      <>
        <ol className="how__steps">
          {items.map((s) => (
            <li key={s.title} className="how__step">
              <b>{s.title}</b>
              <span className="how__calc">{s.text}</span>
            </li>
          ))}
        </ol>
        <p className="how__total">
          <span>{t('how.total')}</span>
          <b>{kcal(norm.kcal)}</b>
        </p>
      </>
    );
  }

  return (
    <article className="how">
      {props.manualKcal != null && (
        <Banner>{t('how.manual', { n: fmt(props.manualKcal) })}</Banner>
      )}
      <h2 className="how__title" ref={titleRef} tabIndex={-1}>
        {t('how.title')}
      </h2>
      {body}
      <p className="how__note">{t('how.note')}</p>
      <section className="how__sources">
        <h3>{t('how.sources')}</h3>
        <ul>
          {SOURCES.map(({ title, href }) => (
            <li key={title}>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {title} <span aria-hidden="true">↗</span>
                </a>
              ) : (
                title
              )}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
