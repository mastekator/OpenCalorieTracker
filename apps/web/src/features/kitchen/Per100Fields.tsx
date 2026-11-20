import { useId } from 'react';
import { CircleAlert, Scale } from 'lucide-react';
import type { Nutrients } from '@oct/shared';
import { useT } from '../../i18n';
import { Field } from '../../ui/Field/Field';
import '../../ui/MacroStat/MacroStat.css';
import '../../ui/NutritionCard/NutritionCard.css';

export type Per100Values = {
  kcal: string;
  proteinG: string;
  fatG: string;
  carbsG: string;
  /** Serving weight as typed, in the user's units. */
  serving: string;
};
export type MacroKey = 'proteinG' | 'fatG' | 'carbsG';

type Props = {
  values: Per100Values;
  errors: {
    kcal?: string;
    /** One message under the three macro fields; `bad` get a red border. */
    macros?: { text: string; bad: readonly MacroKey[] };
    serving?: string;
  };
  /** «g» or «oz», for the serving weight. */
  unit: string;
  /** One serving, or null while the values are invalid or there is no serving weight. */
  preview: { n: Nutrients; g: string } | null;
  onChange: (patch: Partial<Per100Values>) => void;
};

const MACROS = [
  ['proteinG', 'protein'],
  ['fatG', 'fat'],
  ['carbsG', 'carbs'],
] as const;

/** The editor's «Calories per 100 g» mode (OCT-352 1.2–1.4, ADR-0035 §2); state and checks live in the editor. */
export function Per100Fields({
  values,
  errors,
  unit,
  preview,
  onChange,
}: Props) {
  const { t, num } = useT();
  const macrosNote = useId();
  const servingNote = useId();
  // E-10.1: a minus is never accepted.
  const typed = (k: keyof Per100Values) => ({
    value: values[k],
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    onChange: (e: { target: { value: string } }) =>
      onChange({ [k]: e.target.value.replace(/-/g, '') }),
  });
  return (
    <>
      <div className="recipe-editor__per100">
        <Field
          {...typed('kcal')}
          label={t('editor.per100.kcal')}
          tag={t('editor.per100.required')}
          placeholder={t('editor.per100.kcal_ph')}
          suffix={t('today.kcal')}
          error={errors.kcal}
        />
        <div>
          <div className="recipe-editor__macros">
            {MACROS.map(([k, label]) => (
              <Field
                key={k}
                {...typed(k)}
                label={t(`macro.${label}`)}
                placeholder="0"
                suffix={t('macro.g')}
                invalid={errors.macros?.bad.includes(k)}
                aria-describedby={macrosNote}
              />
            ))}
          </div>
          {errors.macros ? (
            <p id={macrosNote} className="recipe-editor__error" role="alert">
              <CircleAlert aria-hidden="true" />
              {errors.macros.text}
            </p>
          ) : (
            <p id={macrosNote} className="recipe-editor__note">
              <Scale aria-hidden="true" />
              {t('editor.per100.macros_note')}
            </p>
          )}
        </div>
        <div>
          <Field
            {...typed('serving')}
            label={t('editor.per100.serving', { u: unit })}
            placeholder="100"
            suffix={unit}
            error={errors.serving}
            aria-describedby={servingNote}
          />
          {!errors.serving && (
            <p id={servingNote} className="recipe-editor__note">
              <Scale aria-hidden="true" />
              {t('editor.per100.serving_note')}
            </p>
          )}
        </div>
      </div>
      <section
        className="nutrition-card recipe-editor__preview"
        aria-label={t('editor.per100.preview')}
        aria-live="polite"
      >
        <p className="recipe-editor__preview-title">
          {t('editor.per100.preview')}
        </p>
        {preview ? (
          <>
            <p className="nutrition-card__kcal">
              <span className="nutrition-card__value">
                {num(preview.n.kcal)}
              </span>{' '}
              {t('editor.per100.preview_kcal', { g: preview.g, u: unit })}
            </p>
            <p className="nutrition-card__macros">
              {(
                [
                  ['p', 'protein', preview.n.proteinG],
                  ['f', 'fat', preview.n.fatG],
                  ['c', 'carbs', preview.n.carbsG],
                ] as const
              ).map(([k, m, v]) => (
                <span key={k}>
                  <i
                    className={`macro__dot macro__dot--${m}`}
                    aria-hidden="true"
                  />
                  {t(`recipe.nut.${k}`, {
                    g: `${num(v)}\u00a0${t('macro.g')}`,
                  })}
                </span>
              ))}
            </p>
          </>
        ) : (
          <>
            <p className="nutrition-card__kcal">
              <span className="nutrition-card__value">—</span>
            </p>
            <p className="recipe-editor__note">
              {t('editor.per100.preview_empty')}
            </p>
          </>
        )}
      </section>
    </>
  );
}
