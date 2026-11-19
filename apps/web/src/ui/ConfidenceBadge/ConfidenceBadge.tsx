import { Check, ChefHat, CircleAlert, History } from 'lucide-react';
import { confidenceLevel, type DishSource } from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import './ConfidenceBadge.css';

type Props = {
  source: DishSource;
  /** 0..1 for AI dishes; omit once the user edited the dish (AC-2.9). */
  confidence?: number;
};

/** Where a dish's numbers come from: AI confidence as a word, manual, history or recipe (OCT-16 §3, OCT-160 §5). */
export function ConfidenceBadge({ source, confidence }: Props) {
  const { t } = useT();
  if (source === 'manual') return <Badge>{t('edit.source.manual')}</Badge>;
  if (source === 'history')
    return (
      <Badge>
        <History aria-hidden="true" />
        {t('edit.source.history')}
      </Badge>
    );
  if (source === 'recipe')
    return (
      <Badge>
        <ChefHat aria-hidden="true" />
        {t('edit.source.recipe')}
      </Badge>
    );
  if (confidence === undefined) return null;
  const level = confidenceLevel(confidence);
  const a11y = t(`edit.conf.a11y.${level}`);
  // High confidence shows nothing (the norm stays quiet), but is still read out.
  if (level === 'high') return <span className="confidence__sr">{a11y}</span>;
  return (
    <span aria-label={a11y} role="img">
      {level === 'exact' ? (
        <Badge tone="ok">
          <Check aria-hidden="true" />
          {t('edit.conf.exact')}
        </Badge>
      ) : level === 'low' ? (
        <Badge tone="warn">
          <CircleAlert aria-hidden="true" />
          {t('edit.conf.low')}
        </Badge>
      ) : (
        <Badge>{t('edit.conf.mid')}</Badge>
      )}
    </span>
  );
}
