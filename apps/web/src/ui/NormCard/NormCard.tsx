import { useId, type ReactNode } from 'react';
import { ChevronRight, List, Pencil, Sparkles, Target } from 'lucide-react';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { MacroSplit } from '../MacroSplit/MacroSplit';
import './NormCard.css';

type Norm = { kcal: number; protein: number; fat: number; carbs: number };

type Props =
  /** 8.4 / 8.5 / 8.9: the goal with its source or «not saved» while editing. */
  | {
      state: 'norm';
      norm: Norm;
      badge: 'calc' | 'manual' | 'draft';
      onHow: () => void;
      /** Banners or lines inside the card under the macros (pace, «Reset to calculated»). */
      children?: ReactNode;
    }
  /** 8.3 / 8.11: no goal yet; `message` says what to add or fix. */
  | { state: 'empty'; message: string; children?: ReactNode }
  /** 8.1 / 8.2: first visit. Without `onAgent` (no AI) only the form path is offered. */
  | { state: 'first'; onAgent?: () => void; onForm: () => void };

const BADGE_TONE = { calc: 'neutral', manual: 'ok', draft: 'warn' } as const;

export function NormCard(props: Props) {
  const { t, locale } = useT();
  const id = useId();

  if (props.state === 'first')
    return (
      <section className="norm-card" aria-labelledby={id}>
        <h2 id={id} className="norm-card__first-title">
          {t('norm.first.title')}
        </h2>
        <p className="norm-card__first-body">
          {t(props.onAgent ? 'norm.first.body' : 'norm.first.body_no_ai')}
        </p>
        {props.onAgent && (
          <div className="norm-card__paths">
            <button
              type="button"
              className="norm-card__path"
              onClick={props.onAgent}
            >
              <b>
                <Sparkles aria-hidden="true" />
                {t('norm.path.agent')}
              </b>
              <span>{t('norm.path.agent_sub')}</span>
            </button>
            <button
              type="button"
              className="norm-card__path"
              onClick={props.onForm}
            >
              <b>
                <List aria-hidden="true" />
                {t('norm.path.form')}
              </b>
              <span>{t('norm.path.form_sub')}</span>
            </button>
          </div>
        )}
      </section>
    );

  const head = (badge?: ReactNode) => (
    <div className="norm-card__head">
      <h2 className="norm-card__label">
        <Target aria-hidden="true" />
        {t('norm.title')}
      </h2>
      {badge}
    </div>
  );

  if (props.state === 'empty')
    return (
      <section className="norm-card">
        {head()}
        <p className="norm-card__empty">{props.message}</p>
        {props.children}
      </section>
    );

  const { norm, badge } = props;
  return (
    <section className="norm-card">
      {head(
        <Badge tone={BADGE_TONE[badge]}>
          {badge === 'manual' && <Pencil aria-hidden="true" />}
          {t(`norm.badge.${badge}`)}
        </Badge>,
      )}
      <p className="norm-card__kcal">
        <span className="norm-card__number">
          {new Intl.NumberFormat(locale).format(norm.kcal)}
        </span>{' '}
        {t('norm.unit')}
      </p>
      <MacroSplit protein={norm.protein} fat={norm.fat} carbs={norm.carbs} />
      {props.children}
      <button type="button" className="norm-card__how" onClick={props.onHow}>
        {t('norm.how')}
        <ChevronRight aria-hidden="true" />
      </button>
    </section>
  );
}
