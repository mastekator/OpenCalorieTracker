import { useRef, type ReactNode } from 'react';
import { Compass, Copy, Share, SquarePlus, WifiOff, Zap } from 'lucide-react';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { Sheet } from '../Sheet/Sheet';
import { useToast } from '../Toast/Toast';
import './InstallSheet.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** `safari`: three steps (2.2); `other-browser`: «Open in Safari» with the address (2.4). */
  variant: 'safari' | 'other-browser';
  /** The app address to copy (other-browser). */
  url: string;
};

/** A system button as it looks in iOS, so it is easy to find on screen. */
const SysKey = ({ icon, children }: { icon?: ReactNode; children: string }) => (
  <span className="syskey">
    {icon}
    {children}
  </span>
);

/** How to install on iPhone (OCT-25 2.2, 2.4); Settings opens the same sheet. */
export function InstallSheet({ open, onClose, variant, url }: Props) {
  const { t } = useT();
  const toast = useToast();
  const urlRef = useRef<HTMLParagraphElement>(null);

  async function copy() {
    try {
      // Often missing in in-app webviews and outside a secure context.
      await navigator.clipboard.writeText(url);
      toast({ text: t('install.safari.copied') });
    } catch {
      const range = document.createRange();
      range.selectNodeContents(urlRef.current!);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      toast({ text: t('install.safari.copy_failed') });
    }
  }

  if (variant === 'other-browser')
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={t('install.safari.title')}
        footer={
          <Button onClick={() => void copy()}>
            <Copy aria-hidden="true" />
            {t('install.safari.copy')}
          </Button>
        }
      >
        <div className="install-sheet">
          <p>{t('install.safari.body')}</p>
          <p className="install-sheet__url">
            <Compass aria-hidden="true" />
            <span ref={urlRef}>{url}</span>
          </p>
        </div>
      </Sheet>
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('install.sheet.title')}
      footer={
        <Button variant="tonal" onClick={onClose}>
          {t('common.got_it')}
        </Button>
      }
    >
      <div className="install-sheet">
        <ol className="install-sheet__steps">
          <li>
            <span>
              {t('install.tap')}{' '}
              <SysKey icon={<Share aria-hidden="true" />}>
                {t('install.share')}
              </SysKey>
              <span className="install-sheet__hint">
                {t('install.step1_hint')}
              </span>
            </span>
          </li>
          <li>
            <span>
              {t('install.choose')}{' '}
              <SysKey icon={<SquarePlus aria-hidden="true" />}>
                {t('install.home')}
              </SysKey>
              <span className="install-sheet__hint">
                {t('install.step2_hint')}
              </span>
            </span>
          </li>
          <li>
            <span>
              {t('install.tap')} <SysKey>{t('install.add')}</SysKey>
            </span>
          </li>
        </ol>
        <ul className="install-sheet__why">
          <li>
            <Zap aria-hidden="true" />
            {t('install.why1')}
          </li>
          <li>
            <WifiOff aria-hidden="true" />
            {t('install.why2')}
          </li>
        </ul>
      </div>
    </Sheet>
  );
}
