import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useToast } from '../../ui/Toast/Toast';
import './admin.css';

type Props = {
  url: string;
  /** Who the link is for and until when (link_ready.invite_body / recovery_body). */
  body: string;
  onClose: () => void;
};

/** 4.3 Link ready (OCT-13 §7): the only time the link is shown; closing before it is saved asks first. */
export function LinkReadySheet({ url, body, onClose }: Props) {
  const { t } = useT();
  const toast = useToast();
  const linkRef = useRef<HTMLParagraphElement>(null);
  const [saved, setSaved] = useState(false);
  const [manual, setManual] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const canShare = typeof navigator.share === 'function';

  async function share() {
    try {
      await navigator.share({ url });
      setSaved(true);
    } catch {
      // Cancelled (AbortError) or refused: the link is not out yet.
    }
  }

  async function copy() {
    try {
      // Missing outside a secure context (plain HTTP): falls to the manual path.
      await navigator.clipboard.writeText(url);
      setSaved(true);
      toast({ text: t('link_ready.copied') });
    } catch {
      const range = document.createRange();
      range.selectNodeContents(linkRef.current!);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      setManual(true);
    }
  }

  return (
    <>
      <Sheet
        open
        title={t('link_ready.title')}
        onClose={() => (saved ? onClose() : setConfirm(true))}
        footer={
          <div className="link-ready__actions">
            {canShare && (
              <Button onClick={() => void share()}>
                {t('link_ready.share')}
              </Button>
            )}
            <Button
              variant={canShare ? 'tonal' : 'primary'}
              onClick={() => void copy()}
            >
              {t('link_ready.copy')}
            </Button>
          </div>
        }
      >
        <div className="admin-sheet">
          <p>{body}</p>
          <p className="link-ready__url" ref={linkRef}>
            {url}
          </p>
          <p role="status" className="admin-sheet__note">
            {manual ? t('link_ready.copy_manual') : t('invites.once_hint')}
          </p>
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        title={t('link_ready.close_confirm')}
        confirmLabel={t('common.close')}
        onConfirm={onClose}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
