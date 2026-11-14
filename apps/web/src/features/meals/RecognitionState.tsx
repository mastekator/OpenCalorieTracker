import { useEffect, useRef } from 'react';
import { CircleAlert, CloudOff, Gauge, SearchX, WifiOff } from 'lucide-react';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { OfflineBar } from '../../ui/OfflineBar/OfflineBar';
import { ScreenState } from '../../ui/ScreenState/ScreenState';
import { Skeleton } from '../../ui/Skeleton/Skeleton';
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

type Props = {
  state: RecognitionStateKind;
  photoUrl: string;
  onRetry: () => void;
  onRetake: () => void;
  onManual: () => void;
  onClose: () => void;
};

/** The photo under recognition and what is happening to it; no requests here. */
export function RecognitionState({
  state,
  photoUrl,
  onRetry,
  onRetake,
  onManual,
  onClose,
}: Props) {
  const { t } = useT();
  const waiting = state === 'loading' || state === 'slow';
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (waiting) titleRef.current?.focus();
  }, [waiting]);

  const retry = (
    <Button key="retry" onClick={onRetry}>
      {t('common.retry')}
    </Button>
  );
  const retake = (variant: 'primary' | 'tonal') => (
    <Button key="retake" variant={variant} onClick={onRetake}>
      {t('common.retake')}
    </Button>
  );
  const manual = (variant: 'primary' | 'tonal') => (
    <Button key="manual" variant={variant} onClick={onManual}>
      {t('common.manual_full')}
    </Button>
  );

  const error = {
    loading: null,
    slow: null,
    unavailable: {
      icon: <CloudOff />,
      tone: 'danger',
      title: t('recog.err.unavailable.title'),
      body: t('recog.err.unavailable.body'),
      actions: [retry, manual('tonal')],
    },
    quota: {
      icon: <Gauge />,
      tone: 'warning',
      title: t('recog.err.quota.title'),
      body: t('recog.err.quota.body'),
      actions: [
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
      body: t('recog.err.failed.body'),
      actions: [retry, retake('tonal'), manual('tonal')],
    },
    gone: {
      icon: <CircleAlert />,
      tone: 'danger',
      title: t('recog.err.failed.title'),
      body: t('errors.photo_expired'),
      actions: [retake('primary'), manual('tonal')],
    },
    empty: {
      icon: <SearchX />,
      tone: 'neutral',
      title: t('recog.empty.title'),
      body: t('recog.empty.body'),
      actions: [retake('primary'), manual('tonal')],
    },
    offline: {
      icon: <WifiOff />,
      tone: 'neutral',
      title: t('recog.offline.title'),
      body: t('recog.offline.body'),
      // shortcut: «Save without recognizing» waits for the offline queue (epic OCT-6).
      actions: [manual('primary')],
    },
  } as const;
  const shown = error[state];

  return (
    <div className={`recog${waiting ? '' : ' recog--done'}`}>
      {state === 'offline' && <OfflineBar />}
      <div className="recog__photo">
        <img src={photoUrl} alt="" />
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
            <p className="recog__hint">{t('recog.usual')}</p>
          </div>
          {state === 'loading' ? (
            <>
              <Skeleton height="var(--control-height-lg)" />
              <Skeleton height="var(--control-height-lg)" />
            </>
          ) : (
            <>
              <Banner tone="notice">{t('recog.slow')}</Banner>
              {manual('tonal')}
            </>
          )}
        </div>
      )}
    </div>
  );
}
