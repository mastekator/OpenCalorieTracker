import { useEffect, useRef } from 'react';
import { useT } from '../../i18n';
import { Button } from '../Button/Button';
import { Sheet } from '../Sheet/Sheet';
import './CopySheet.css';

/** Writes to the clipboard; false where the browser refuses (plain http, webviews). */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type Props = {
  /** The text to copy; null keeps the sheet closed. */
  text: string | null;
  title: string;
  onClose: () => void;
};

/** When copying is refused (OCT-248 5.2): the text already selected, the system menu copies it. */
export function CopySheet({ text, title, onClose }: Props) {
  const { t } = useT();
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  }, [text]);

  return (
    <Sheet
      open={text !== null}
      onClose={onClose}
      title={title}
      footer={
        <Button variant="tonal" onClick={onClose}>
          {t('common.done')}
        </Button>
      }
    >
      <div className="copy-sheet">
        <p>{t('ai.test.sheet_body')}</p>
        <pre ref={ref} className="copy-sheet__text">
          {text}
        </pre>
      </div>
    </Sheet>
  );
}
