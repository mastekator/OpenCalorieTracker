import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { z } from 'zod';
import { AI_PROVIDERS, type AiConsentRequired } from '@oct/shared';
import { api, ApiError } from '../../api/client';
import { useSession } from '../../app/SessionContext';
import { addConsent, refreshConsents } from '../../data/aiConsents';
import {
  ConsentSheet,
  type ConsentWhat,
} from '../../ui/ConsentSheet/ConsentSheet';

type WithConsent = <T>(what: ConsentWhat, call: () => Promise<T>) => Promise<T>;

/** Without the provider (stories, screen tests) a call runs as is. */
const Context = createContext<WithConsent>((_, call) => call());

/**
 * Wraps one AI call (ADR-0031 §3): on 403 ai_consent_required asks the user, and after «Allow»
 * stores the consent and repeats the call once. «Not now» rethrows the 403, so every screen
 * goes on as after any other AI error.
 */
export const useAiConsent = () => useContext(Context);

/** The 403 to ask about, with what the sheet needs: an older server may lack the details. */
const consentDetails = (err: ApiError) => {
  const d = err.details as AiConsentRequired | undefined;
  return err.code === 'ai_consent_required' &&
    d?.providerKey &&
    d.provider in AI_PROVIDERS
    ? d
    : null;
};

type Ask = {
  details: AiConsentRequired;
  what: ConsentWhat;
  answer: (allowed: boolean) => void;
};

/** One sheet for the whole app: calls that hit the 403 together wait for the same answer. */
export function AiConsentProvider({ children }: { children: ReactNode }) {
  const userId = useSession().user?.id;
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    if (userId && navigator.onLine)
      void refreshConsents(userId).catch(() => {});
  }, [userId]);

  const withConsent = useCallback<WithConsent>(async (what, call) => {
    try {
      return await call();
    } catch (err) {
      const details = err instanceof ApiError && consentDetails(err);
      if (!details) throw err;
      pending.current ??= new Promise<boolean>((resolve) =>
        setAsk({
          details,
          what,
          answer: resolve,
        }),
      ).finally(() => {
        pending.current = null;
        setAsk(null);
      });
      if (!(await pending.current)) throw err;
      // Once only: a second 403 (the provider changed meanwhile) goes to the caller as is.
      return call();
    }
  }, []);

  async function allow({ details, answer }: Ask) {
    setBusy(true);
    try {
      await api('/api/ai/consents', z.unknown(), {
        method: 'POST',
        body: { providerKey: details.providerKey },
      });
      if (userId) addConsent(userId, details.providerKey);
      answer(true);
    } catch {
      // Not stored: the action ends as after «Not now» rather than asking again.
      answer(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Context value={withConsent}>
      {children}
      {ask && (
        <ConsentSheet
          open
          details={ask.details}
          what={ask.what}
          busy={busy}
          onAllow={() => void allow(ask)}
          onClose={() => ask.answer(false)}
        />
      )}
    </Context>
  );
}
