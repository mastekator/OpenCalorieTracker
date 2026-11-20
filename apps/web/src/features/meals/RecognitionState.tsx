import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CloudOff, Gauge, SearchX, WifiOff } from 'lucide-react';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { OfflineBar } from '../../ui/OfflineBar/OfflineBar';
import { useBarVariant } from '../../app/connection';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import {
  RecognitionSteps,
  type Step,
} from '../../ui/RecognitionSteps/RecognitionSteps';
import type { PhotoBarcodesResponse } from '@oct/shared';
import './RecognitionState.css';

/** Screen 3 states (design OCT-16 §2): 3.1 loading … 3.7 offline; `gone` is 3.5 without a retry. */
export type RecognitionStateKind =
  | 'loading'
  | 'slow'
  | 'unavailable'
  | 'quota'
  | 'failed'
  | 'gone'
  | 'empty'
  | 'offline';

/** POST /photos/:id/barcodes: still going, failed, or the codes read and looked up. */
export type PhotoCodes = PhotoBarcodesResponse['codes'] | 'pending' | 'failed';

type T = ReturnType<typeof useT>['t'];

/** The three steps of OCT-313 §1 from what the barcode lookup and the AI status say. */
export function recognitionSteps(
  t: T,
  codes: PhotoCodes,
  ai: 'run' | 'none',
): Step[] {
  type Mark = Omit<Step, 'title'>;
  const found = typeof codes === 'string' ? [] : codes;
  const mine = found.length > 0 && found.every((c) => c.result.from === 'mine');
  const barcode: Mark =
    codes === 'pending'
      ? { mark: 'run' }
      : codes === 'failed'
        ? { mark: 'skip' }
        : found.length === 0
          ? { mark: 'skip', caption: t('recog.barcode.none') }
          : {
              mark: 'done',
              caption: mine
                ? t('recog.barcode.mine')
                : found.length === 1
                  ? found[0]!.code
                  : t('recog.barcode.many', { count: found.length }),
            };

  // Own products need no Open Food Facts; the rest say what it answered.
  const rest = found.filter((c) => c.result.from !== 'mine');
  const offHit = rest.find((c) => c.result.from === 'off')?.result.product;
  const offStatus = rest[0]?.result.off;
  const off: Mark =
    codes === 'pending'
      ? { mark: 'wait' }
      : codes === 'failed'
        ? { mark: 'skip' }
        : offHit
          ? { mark: 'done', caption: offHit.name ?? offHit.brand ?? undefined }
          : offStatus === 'down' || offStatus === 'missing'
            ? { mark: 'warn', caption: t(`recog.off.${offStatus}`) }
            : offStatus === 'disabled' || offStatus === 'blocked'
              ? {
                  mark: 'skip',
                  caption: t(
                    offStatus === 'disabled'
                      ? 'recog.off.off'
                      : 'recog.off.blocked',
                  ),
                }
              : { mark: 'skip', caption: t('recog.off.not_needed') };

  // The AI reads the nutrition table when no product numbers came (E-12).
  const label =
    off.mark === 'warn' ||
    found.some((c) => c.result.product && c.result.product.kcal100 === null);
  const aiStep: Mark =
    ai === 'none'
      ? { mark: 'skip', caption: t('recog.ai.none') }
      : {
          mark: 'run',
          caption: found.length
            ? t(label ? 'recog.ai.label' : 'recog.ai.rest')
            : undefined,
        };

  return [
    { ...barcode, title: t('recog.step.barcode') },
    { ...off, title: t('recog.step.off') },
    { ...aiStep, title: t('recog.step.ai') },
  ];
}

type Props = {
  state: RecognitionStateKind;
  /** Barcodes read from the photo (OCT-313 §1). */
  codes?: PhotoCodes;
  /** none: AI isn't set up, only the barcode steps run (AC-4.7). */
  ai?: 'run' | 'none';
  photoUrl: string;
  onRetry: () => void;
  /** None: no «Retake» (recalculating a saved meal's photo). */
  onRetake?: () => void;
  onManual: () => void;
  onClose: () => void;
};

/** The photo under recognition and what is happening to it; no requests here. */
export function RecognitionState({
  state,
  codes = 'pending',
  ai = 'run',
  photoUrl,
  onRetry,
  onRetake,
  onManual,
  onClose,
}: Props) {
  const { t } = useT();
  // No «Retake» means recalculating a saved meal: every way out leads back to it.
  const recalc = !onRetake;
  // The flow sits outside AppShell, so it shows the connection bar itself; an offline result shows it even if navigator.onLine lies.
  const bar = useBarVariant();
  const waiting = state === 'loading' || state === 'slow';
  const titleRef = useRef<HTMLHeadingElement>(null);
  // A deleted or unreachable photo leaves the surface-2 placeholder, not a broken-image icon.
  const [photoBroken, setPhotoBroken] = useState(false);
  useEffect(() => {
    if (waiting) titleRef.current?.focus();
  }, [waiting]);

  const retry = (variant: 'primary' | 'tonal') => (
    <Button key="retry" variant={variant} onClick={onRetry}>
      {t('common.retry')}
    </Button>
  );
  const retake = (variant: 'primary' | 'tonal') =>
    onRetake && (
      <Button key="retake" variant={variant} onClick={onRetake}>
        {t('common.retake')}
      </Button>
    );
  const manual = (variant: 'primary' | 'tonal') => (
    <Button key="manual" variant={variant} onClick={onManual}>
      {t(recalc ? 'recalc.back' : 'common.manual_full')}
    </Button>
  );

  const error = {
    loading: null,
    slow: null,
    unavailable: {
      icon: <CloudOff />,
      tone: 'danger',
      title: t('recog.err.unavailable.title'),
      body: t(recalc ? 'recalc.unavailable' : 'recog.err.unavailable.body'),
      actions: [retry('primary'), manual('tonal')],
    },
    quota: {
      icon: <Gauge />,
      tone: 'warning',
      title: t('recog.err.quota.title'),
      body: t(recalc ? 'recalc.quota' : 'recog.err.quota.body'),
      actions: recalc
        ? [manual('primary')]
        : [
            manual('primary'),
            <Button key="close" variant="plain" onClick={onClose}>
              {t('common.close')}
            </Button>,
          ],
    },
    failed: {
      icon: <CircleAlert />,
      tone: 'danger',
      title: t('recog.err.failed.title'),
      body: t(recalc ? 'recalc.failed' : 'recog.err.failed.body'),
      actions: [retry('primary'), retake('tonal'), manual('tonal')],
    },
    gone: {
      icon: <CircleAlert />,
      tone: 'danger',
      title: t(recalc ? 'recalc.gone.title' : 'recog.err.failed.title'),
      body: t(recalc ? 'recalc.gone.body' : 'errors.photo_expired'),
      actions: recalc
        ? [manual('primary')]
        : [retake('primary'), manual('tonal')],
    },
    empty: {
      icon: <SearchX />,
      tone: 'neutral',
      title: t('recog.empty.title'),
      body: t(recalc ? 'recalc.empty' : 'recog.empty.body'),
      actions: [retake('primary'), manual('tonal')],
    },
    offline: {
      icon: <WifiOff />,
      tone: 'neutral',
      title: t('recog.offline.title'),
      body: t(recalc ? 'recalc.offline' : 'recog.offline.body'),
      // shortcut: «Save without recognizing» and its copy wait for the offline queue (epic OCT-6).
      actions: [manual('primary'), retry('tonal')],
    },
  } as const;
  const shown = error[state];

  return (
    <div className={`recog${waiting ? '' : ' recog--done'}`}>
      <OfflineBar variant={state === 'offline' ? 'offline' : bar} />
      <div className="recog__photo">
        {!photoBroken && (
          <img src={photoUrl} alt="" onError={() => setPhotoBroken(true)} />
        )}
        {waiting && <span className="recog__glint" aria-hidden="true" />}
      </div>
      {shown ? (
        <ScreenState
          key={state}
          icon={shown.icon}
          tone={shown.tone}
          title={shown.title}
          role="alert"
          focusTitle
          action={shown.actions}
        >
          {shown.body}
        </ScreenState>
      ) : (
        <div className="recog__wait">
          <div role="status">
            <h2 ref={titleRef} className="recog__title" tabIndex={-1}>
              <span className="recog__spinner" aria-hidden="true" />
              {t('recog.loading')}
            </h2>
            {/* In 3.2 the «taking longer» banner replaces this hint. */}
            {state === 'loading' && (
              <p className="recog__hint">{t('recog.usual')}</p>
            )}
          </div>
          <RecognitionSteps
            label={t('recog.steps_a11y')}
            steps={recognitionSteps(t, codes, ai)}
          />
          {state === 'slow' && (
            <>
              <Banner tone="notice">
                {t(recalc ? 'recalc.slow' : 'recog.slow')}
              </Banner>
              {manual('tonal')}
            </>
          )}
        </div>
      )}
    </div>
  );
}
