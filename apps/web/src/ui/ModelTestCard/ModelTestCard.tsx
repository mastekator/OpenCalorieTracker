import {
  ChevronRight,
  Copy,
  FlaskConical,
  History,
  Square,
} from 'lucide-react';
import { AI_PROVIDERS, type AiProviderId, type AiTestRun } from '@oct/shared';
import { useT } from '../../i18n';
import { Banner } from '../Banner/Banner';
import { Button } from '../Button/Button';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import { TestPhotoList } from '../TestPhotoList/TestPhotoList';
import './ModelTestCard.css';

type Props = {
  /** The run to show: the one going on, else the latest; null before the first. */
  run: AiTestRun | null;
  /** What a new run tests: «Google · gemini-…». */
  target: string;
  /** After the target: «not saved» or «current, from .env». */
  targetNote?: string;
  /** Settings from .env: the target row opens «Another model for the test» (OCT-248 3.3). */
  onTarget?: () => void;
  /** No model in the form yet. */
  disabled?: boolean;
  starting?: boolean;
  onStart: () => void;
  onStop: () => void;
  onCopy: (kind: 'row' | 'report') => void;
};

/** «Model test» on «AI provider» (OCT-248 §4): idle, running, result, stopped, interrupted. */
export function ModelTestCard({
  run,
  target,
  targetNote,
  onTarget,
  disabled = false,
  starting = false,
  onStart,
  onStop,
  onCopy,
}: Props) {
  const { t, locale } = useT();
  const providerName = (id: AiProviderId) =>
    AI_PROVIDERS[id].name ?? t('ai.compatible');
  const status = run?.status;

  const targetText = (
    <>
      <span className="model-test__mono">{target}</span>
      {targetNote && `\u00a0· ${targetNote}`}
    </>
  );
  const targetLine = onTarget ? (
    <button
      type="button"
      className="model-test__target model-test__target--button"
      onClick={onTarget}
    >
      <span>
        {t('ai.test.target')}
        <span className="model-test__sub">{targetText}</span>
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  ) : (
    <p className="model-test__target">
      {t('ai.test.target')}: {targetText}
    </p>
  );
  const startButton = (
    variant: 'tonal' | 'plain',
    label = t('ai.test.start'),
  ) => (
    <Button
      variant={variant}
      loading={starting}
      disabled={disabled}
      onClick={onStart}
    >
      {!starting && <FlaskConical aria-hidden="true" />}
      {label}
    </Button>
  );

  const head = (
    <div className="model-test__head">
      <h2>{t('ai.test.title')}</h2>
      <p>{t('ai.test.body')}</p>
    </div>
  );

  if (!run || status === 'interrupted')
    return (
      <section className="model-test">
        {head}
        {run && (
          <Banner
            tone="notice"
            icon={<History />}
            title={t('ai.test.interrupted')}
          >
            {t('ai.test.interrupted_body')}
          </Banner>
        )}
        {targetLine}
        {startButton('tonal', run ? t('ai.test.again') : undefined)}
      </section>
    );

  const total = run.photos.length;
  const done = run.photos.filter(
    (p) => p.result !== 'pending' && p.result !== 'not_run',
  ).length;
  const notRun = total - done;
  const runTarget = `${providerName(run.provider)} · ${run.model}`;

  if (status === 'running') {
    const current = Math.min(done + 1, total);
    return (
      <section className="model-test">
        {head}
        <div className="model-test__progress">
          <span className="model-test__count" aria-live="polite">
            {t('ai.test.progress', { current, total })}
          </span>
          <Button variant="danger-plain" small onClick={onStop}>
            <Square aria-hidden="true" />
            {t('ai.test.stop')}
          </Button>
        </div>
        <ProgressBar
          value={done}
          max={total}
          label={t('ai.test.progress_label')}
        />
        <p className="model-test__target">
          {t('ai.test.target')}:{' '}
          <span className="model-test__mono">{runTarget}</span>
        </p>
        <TestPhotoList photos={run.photos} running />
      </section>
    );
  }

  const tokens = (run.inputTokens ?? 0) + (run.outputTokens ?? 0);
  const metrics = [
    run.msPerPhoto !== null &&
      t('ai.test.per_photo', {
        sec: (run.msPerPhoto / 1000).toLocaleString(locale, {
          maximumFractionDigits: 1,
        }),
      }),
    run.costUsd !== null &&
      `≈\u00a0${run.costUsd.toLocaleString(locale, { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 })}`,
    tokens > 0 &&
      t('ai.test.tokens', {
        count: tokens.toLocaleString(locale, {
          notation: 'compact',
          maximumFractionDigits: 1,
        }),
      }),
  ].filter(Boolean);
  if (run.costUsd === null && tokens === 0) metrics.push('—');
  const meta = [
    notRun > 0 && t('ai.test.not_run_count', { count: notRun }),
    providerName(run.provider),
    run.model,
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
      run.startedAt,
    ),
    t('ai.test.versions', { app: run.appVersion, prompt: run.promptVersion }),
  ].filter(Boolean);
  const stopped = status === 'stopped';

  return (
    <section className="model-test">
      {head}
      {stopped && (
        <Banner
          tone="warning"
          title={t('ai.test.stopped', {
            reason: t(`ai.test.reason.${run.stopReason ?? 'user'}`),
          })}
        >
          {t('ai.test.stopped_body')}
        </Banner>
      )}
      <div className="model-test__summary">
        <p className="model-test__result">
          <b>
            {t('ai.test.passed', {
              passed: run.passed,
              total: stopped ? done : total,
            })}
          </b>
          <span>{t('ai.test.passed_word')}</span>
        </p>
        <p className="model-test__metrics">{metrics.join(' · ')}</p>
        <p className="model-test__meta">{meta.join(' · ')}</p>
      </div>
      {/* Only a complete run makes a MODELS.md row or a report (ADR-0019 §1). */}
      {status === 'done' && run.modelsMdRow && (
        <div className="model-test__actions">
          <Button variant="tonal" onClick={() => onCopy('row')}>
            {t('ai.test.copy_row')}
          </Button>
          <Button variant="plain" onClick={() => onCopy('report')}>
            <Copy aria-hidden="true" />
            {t('ai.test.copy_report')}
          </Button>
        </div>
      )}
      <TestPhotoList photos={run.photos} />
      {startButton('plain')}
    </section>
  );
}
