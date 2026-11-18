import { ChevronDown, Copy, Trash2 } from 'lucide-react';
import {
  AI_PROVIDERS,
  type AiProviderId,
  type AiTestRun,
  type AiTestRunSummary,
} from '@oct/shared';
import { useT } from '../../i18n';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';
import { TestPhotoList } from '../TestPhotoList/TestPhotoList';
import './ModelCompare.css';

/** The best run: most passed among complete runs, then the faster one per photo (AC-2.9). */
export function bestRunId(runs: AiTestRunSummary[]): number | null {
  let best: AiTestRunSummary | null = null;
  for (const r of runs) {
    if (r.status !== 'done') continue;
    if (
      !best ||
      r.passed > best.passed ||
      (r.passed === best.passed &&
        (r.msPerPhoto ?? Infinity) < (best.msPerPhoto ?? Infinity))
    )
      best = r;
  }
  return best?.id ?? null;
}

type Props = {
  /** Finished runs, newest first; a running one belongs to «Model test». */
  runs: AiTestRunSummary[];
  /** The row opened for its photos. */
  openId: number | null;
  /** The opened row's photos; null while they load. */
  openRun: AiTestRun | null;
  onToggle: (id: number) => void;
  onCopy: (id: number, kind: 'row' | 'report') => void;
  onDelete: (id: number) => void;
  onClear: () => void;
};

/** «Model comparison» on «AI provider» (OCT-248 4.6, 6.2): a table on a desktop, cards on a phone. */
export function ModelCompare({
  runs,
  openId,
  openRun,
  onToggle,
  onCopy,
  onDelete,
  onClear,
}: Props) {
  const { t, locale } = useT();
  const best = bestRunId(runs);
  const providerName = (id: AiProviderId) =>
    AI_PROVIDERS[id].name ?? t('ai.compatible');
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  });

  const cost = (r: AiTestRunSummary) => {
    const tokens = (r.inputTokens ?? 0) + (r.outputTokens ?? 0);
    if (r.costUsd !== null)
      return `≈\u00a0${r.costUsd.toLocaleString(locale, { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 })}`;
    if (tokens > 0)
      return t('ai.test.tokens', {
        count: tokens.toLocaleString(locale, {
          notation: 'compact',
          maximumFractionDigits: 1,
        }),
      });
    return '—';
  };

  return (
    <section className="compare" aria-labelledby="compare-title">
      <div className="compare__head">
        <h2 id="compare-title">{t('ai.compare.title')}</h2>
        <Button variant="plain" small onClick={onClear}>
          {t('ai.compare.clear')}
        </Button>
      </div>
      <div className="compare__card">
        {/* Column names for sighted desktop users; each row reads on its own. */}
        <div className="compare__row compare__row--head" aria-hidden="true">
          <span>{t('ai.compare.col.model')}</span>
          <span className="compare__num">{t('ai.compare.col.passed')}</span>
          <span className="compare__num">{t('ai.compare.col.time')}</span>
          <span>{t('ai.compare.col.cost')}</span>
          <span>{t('ai.compare.col.date')}</span>
        </div>
        <ul className="compare__list">
          {runs.map((r) => {
            const done = r.status === 'done';
            const open = openId === r.id;
            const day = date.format(r.startedAt);
            return (
              <li
                key={r.id}
                className={`compare__item${best === r.id ? ' compare__item--best' : ''}`}
              >
                <div className="compare__row">
                  <div className="compare__name">
                    <span className="compare__model">
                      <span className="compare__mono">{r.model}</span>
                      {best === r.id && (
                        <Badge tone="ok">{t('ai.compare.best')}</Badge>
                      )}
                      {r.status === 'stopped' && (
                        <Badge tone="warn">{t('ai.compare.stopped')}</Badge>
                      )}
                      {r.status === 'interrupted' && (
                        <Badge>{t('ai.compare.interrupted')}</Badge>
                      )}
                    </span>
                    <span className="compare__sub">
                      {providerName(r.provider)}
                      <span className="compare__phone"> · {day}</span>
                    </span>
                  </div>
                  <span className="compare__passed compare__num">
                    {r.passed}/{r.total}
                  </span>
                  <span className="compare__metrics">
                    <span className="compare__num">
                      {r.msPerPhoto === null
                        ? '—'
                        : t('ai.test.sec', {
                            sec: (r.msPerPhoto / 1000).toLocaleString(locale, {
                              maximumFractionDigits: 1,
                            }),
                          })}
                    </span>
                    <span>{cost(r)}</span>
                  </span>
                  <span className="compare__date">{day}</span>
                  <span className="compare__actions">
                    {/* Only a complete run makes a MODELS.md row (ADR-0019 §1). */}
                    {done && (
                      <button
                        type="button"
                        className="compare__icon compare__icon--copy compare__desktop"
                        title={t('ai.test.copy_row')}
                        aria-label={`${t('ai.test.copy_row')}: ${r.model}`}
                        onClick={() => onCopy(r.id, 'row')}
                      >
                        <Copy aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="compare__icon compare__icon--delete compare__desktop"
                      title={t('ai.compare.delete')}
                      aria-label={`${t('ai.compare.delete')}: ${r.model}`}
                      onClick={() => onDelete(r.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                    {/* On a phone it covers the whole card: a tap opens the photos (4.6). */}
                    <button
                      type="button"
                      className="compare__icon compare__toggle"
                      aria-expanded={open}
                      aria-controls={`compare-${r.id}`}
                      title={t('ai.compare.photos')}
                      aria-label={`${t('ai.compare.photos')}: ${r.model}`}
                      onClick={() => onToggle(r.id)}
                    >
                      <ChevronDown aria-hidden="true" />
                    </button>
                  </span>
                </div>
                {open && (
                  <div id={`compare-${r.id}`} className="compare__details">
                    <div className="compare__buttons">
                      {done && (
                        <>
                          <Button
                            variant="tonal"
                            small
                            onClick={() => onCopy(r.id, 'row')}
                          >
                            <Copy aria-hidden="true" />
                            {t('ai.test.copy_row')}
                          </Button>
                          <Button
                            variant="plain"
                            small
                            onClick={() => onCopy(r.id, 'report')}
                          >
                            {t('ai.test.copy_report')}
                          </Button>
                        </>
                      )}
                      <span className="compare__phone">
                        <Button
                          variant="danger-plain"
                          small
                          onClick={() => onDelete(r.id)}
                        >
                          <Trash2 aria-hidden="true" />
                          {t('ai.compare.delete')}
                        </Button>
                      </span>
                    </div>
                    {openRun?.id === r.id && (
                      <TestPhotoList photos={openRun.photos} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="compare__note">{t('ai.compare.note')}</p>
    </section>
  );
}
