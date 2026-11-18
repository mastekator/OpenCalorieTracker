import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useT } from '../../i18n';
import './CommandLine.css';

/** A shell command in mono with a copy button; wraps only at spaces (OCT-244 1.2). */
export function CommandLine({ command }: { command: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="command-line">
      <code className="command-line__text">{command}</code>
      <button
        type="button"
        className="command-line__copy"
        aria-label={t(copied ? 'setup.wizard.copied' : 'setup.wizard.copy')}
        onClick={() =>
          // No clipboard (webview, http): the command stays selectable by hand.
          navigator.clipboard?.writeText(command).then(
            () => setCopied(true),
            () => {},
          )
        }
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    </div>
  );
}
