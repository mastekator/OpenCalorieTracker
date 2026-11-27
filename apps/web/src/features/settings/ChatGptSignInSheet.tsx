import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { ExternalLink } from 'lucide-react';
import type { ChatgptStartResponse } from '@oct/shared';
import { api } from '../../api/client';
import { useT } from '../../i18n';
import { Button } from '../../ui/Button/Button';
import { Field } from '../../ui/Field/Field';
import { Sheet } from '../../ui/Sheet/Sheet';
import '../../ui/InstallSheet/InstallSheet.css';
import './settings.css';
import { AI_STATUS_PATH, codeOf } from './aiDraft';

const CHATGPT_PATH = `${AI_STATUS_PATH}/chatgpt`;
const startSchema = z.object({ url: z.string() });

/** The address OpenAI sends the browser to after sign-in carries the attempt's state and a code or an error. */
export const isCallbackUrl = (text: string) => {
  const params = URL.parse(text.trim())?.searchParams;
  return !!params?.get('state') && (params.has('code') || params.has('error'));
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Signed in: the screen re-reads the status. */
  onDone: () => void;
};

/**
 * «Sign in to ChatGPT» (ADR-0031 §4, OCT-178 3.3): open OpenAI's page, then paste back the address the
 * browser failed to open. Every attempt is single use, so a failed one fetches a new address.
 */
export function ChatGptSignInSheet({ open, onClose, onDone }: Props) {
  const { t } = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [startError, setStartError] = useState<string>();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    setUrl(null);
    setStartError(undefined);
    try {
      const res: ChatgptStartResponse = await api(
        `${CHATGPT_PATH}/start`,
        startSchema,
        { method: 'POST' },
      );
      setUrl(res.url);
    } catch (err) {
      setStartError(t(`errors.${codeOf(err)}`));
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    setValue('');
    setError(undefined);
    void start();
  }, [open, start]);

  async function submit() {
    if (!isCallbackUrl(value)) return setError(t('ai.chatgpt.wrong_address'));
    setBusy(true);
    try {
      await api(`${CHATGPT_PATH}/finish`, z.unknown(), {
        method: 'POST',
        body: { callbackUrl: value.trim() },
      });
      onDone();
    } catch (err) {
      setError(t(`errors.${codeOf(err)}`));
      void start();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('ai.chatgpt.sheet_title')}
      footer={
        <Button loading={busy} disabled={!url} onClick={() => void submit()}>
          {t(busy ? 'ai.chatgpt.connecting' : 'ai.chatgpt.connect')}
        </Button>
      }
    >
      <form
        className="install-sheet"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ol className="install-sheet__steps">
          <li>
            <span>
              {t('ai.chatgpt.step1')}
              {startError ? (
                <span className="chatgpt-sheet__open">
                  <span className="install-sheet__hint" role="alert">
                    {startError}
                  </span>
                  <Button variant="tonal" small onClick={() => void start()}>
                    {t('common.retry')}
                  </Button>
                </span>
              ) : (
                <span className="chatgpt-sheet__open">
                  <a
                    className="button button--tonal button--small"
                    href={url ?? undefined}
                    aria-disabled={!url || undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('ai.chatgpt.open')}
                    <ExternalLink aria-hidden="true" />
                  </a>
                </span>
              )}
            </span>
          </li>
          <li>
            <span>{t('ai.chatgpt.step2')}</span>
          </li>
          <li>
            <span>{t('ai.chatgpt.step3')}</span>
          </li>
        </ol>
        <Field
          label={t('ai.chatgpt.field')}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="http://127.0.0.1:1459/auth/callback?code=…"
          hint={t('ai.chatgpt.field_hint')}
          error={error}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(undefined);
          }}
        />
      </form>
    </Sheet>
  );
}
