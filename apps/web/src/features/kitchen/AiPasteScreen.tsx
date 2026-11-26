import { useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { RECIPE_TEXT_MAX, type RecipeParseResponse } from '@oct/shared';
import { api } from '../../api/client';
import { useT } from '../../i18n';
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { NavBar } from '../../ui/NavBar/NavBar';
import { useOnline } from '../../ui/OfflineBar/OfflineBar';
import { NEW_RECIPE_PATH } from './KitchenScreen';
import type { RecipeEditorState } from './RecipeEditor';
import './AiPasteScreen.css';
import { useAiConsent } from '../ai/AiConsent';

const responseSchema = z.custom<RecipeParseResponse>(
  (v) =>
    !!(v as RecipeParseResponse | null)?.draft &&
    Array.isArray((v as RecipeParseResponse).unsure),
);

/** /kitchen/paste: the draft opens in the editor; nothing is saved until the user saves it there. */
export function AiPasteScreen() {
  const online = useOnline();
  const withConsent = useAiConsent();
  const [, navigate] = useLocation();
  return (
    <AiPasteView
      online={online}
      parse={(text) =>
        withConsent('text', () =>
          api('/api/ai/recipes/parse', responseSchema, {
            method: 'POST',
            body: { text },
          }),
        )
      }
      onParsed={({ draft, unsure }) =>
        navigate(NEW_RECIPE_PATH, {
          state: { draft, ai: { unsure } } satisfies RecipeEditorState,
        })
      }
      onManual={() => navigate(NEW_RECIPE_PATH)}
    />
  );
}

type Props = {
  online: boolean;
  /** POST /api/ai/recipes/parse; throws on failure. */
  parse: (text: string) => Promise<RecipeParseResponse>;
  onParsed: (r: RecipeParseResponse) => void;
  /** «Fill in manually»: an empty editor. */
  onManual: () => void;
};

/** «Recipe from text» (OCT-160 §9, frames 7.1, 7.2; AC-6.3–6.5, E-10.6). */
export function AiPasteView({ online, parse, onParsed, onManual }: Props) {
  const { t, num } = useT();
  const id = useId();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  const busy = state === 'busy';
  const go = async () => {
    setState('busy');
    try {
      onParsed(await parse(text.trim()));
    } catch {
      setState('error');
    }
  };
  return (
    <div className="screen">
      <NavBar
        title={t('paste.title')}
        back={{ href: '/kitchen', label: t('kitchen.title') }}
      />
      <main className="screen__body ai-paste">
        <label className="ai-paste__label" htmlFor={id}>
          {t('paste.label')}
        </label>
        <textarea
          id={id}
          className="ai-paste__text"
          value={text}
          maxLength={RECIPE_TEXT_MAX}
          readOnly={busy}
          aria-describedby={`${id}-hint`}
          onChange={(e) => setText(e.target.value)}
        />
        <p id={`${id}-hint`} className="ai-paste__hint">
          <span>{t('paste.no_links')}</span>
          <span className="tabular-nums">
            {`${num(text.length)} / ${num(RECIPE_TEXT_MAX)}`}
          </span>
        </p>
        {state === 'error' && (
          <Banner
            tone="danger"
            title={t('paste.error.title')}
            actions={
              <>
                <button type="button" onClick={() => void go()}>
                  {t('common.retry')}
                </button>
                <button type="button" onClick={onManual}>
                  {t('paste.manual')}
                </button>
              </>
            }
          >
            {t('paste.error.body')}
          </Banner>
        )}
        <p className="ai-paste__sent">
          <Lock aria-hidden="true" />
          {t('paste.sent')}
        </p>
        <Button
          disabled={!online || !text.trim()}
          loading={busy}
          onClick={() => void go()}
        >
          {busy ? (
            <span role="status">{t('paste.busy')}</span>
          ) : (
            t('paste.parse')
          )}
        </Button>
      </main>
    </div>
  );
}
