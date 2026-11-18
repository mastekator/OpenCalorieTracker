import { useEffect, useRef, useState } from 'react';
import {
  refineResponseSchema,
  uuid,
  type RefineRequest,
  type RefineResponse,
} from '@oct/shared';
import { api, ApiError, type ClientErrorCode } from '../../api/client';
import { SLOW_MS, TIMEOUT_MS, whenBack } from './RecognitionScreen';

export type RefineState =
  | { status: 'idle' | 'busy' | 'slow' }
  | { status: 'error'; code: ClientErrorCode };

export type RefineInput = Omit<RefineRequest, 'requestId' | 'sessionId'>;

const IDLE: RefineState = { status: 'idle' };

/**
 * POST /api/ai/refine for the edit screen (ADR-0020 §9). One `sessionId` per opening of the
 * screen, a new `requestId` per request. «Cancel» and unmount drop a late answer; a request
 * dropped in the background or offline is retried once, silently, with the same `requestId`.
 * `S` is what «Undo» brings back: the list and `recalced` before the last successful step.
 */
export function useRefine<S>() {
  const [sessionId] = useState(uuid);
  const [state, setState] = useState<RefineState>(IDLE);
  const [undoTo, setUndoTo] = useState<{ snapshot: S } | null>(null);
  const current = useRef<AbortController | null>(null);

  useEffect(() => () => current.current?.abort(), []);

  const cancel = () => {
    current.current?.abort();
    current.current = null;
    setState(IDLE);
  };

  /** Resolves with the answer, or null after an error (in `state`) or «Cancel». */
  async function run(input: RefineInput, snapshot: S) {
    current.current?.abort();
    const ctrl = new AbortController();
    current.current = ctrl;
    const body: RefineRequest = { ...input, requestId: uuid(), sessionId };
    setState({ status: 'busy' });
    const slow = setTimeout(
      () => setState((s) => (s.status === 'busy' ? { status: 'slow' } : s)),
      SLOW_MS,
    );
    ctrl.signal.addEventListener('abort', () => clearTimeout(slow));
    let resumed = false;

    const call = async (): Promise<RefineResponse> => {
      try {
        return await api('/api/ai/refine', refineResponseSchema, {
          method: 'POST',
          body,
          signal: AbortSignal.any([
            ctrl.signal,
            AbortSignal.timeout(TIMEOUT_MS),
          ]),
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 0 && !resumed) {
          // The server answers the same requestId from its cache: no second paid call (E-6.2).
          resumed = true;
          // whenBack never settles once aborted; «Cancel» must still end `run`.
          await new Promise<void>((resolve, reject) => {
            ctrl.signal.addEventListener('abort', reject);
            void whenBack(ctrl.signal).then(resolve);
          });
          return call();
        }
        throw err;
      }
    };

    try {
      const res = await call();
      if (ctrl.signal.aborted) return null;
      setUndoTo({ snapshot });
      setState(IDLE);
      return res;
    } catch (err) {
      if (ctrl.signal.aborted) return null;
      // A client timeout (not an ApiError) reads as the AI being down, as on recognition.
      setState({
        status: 'error',
        code: err instanceof ApiError ? err.code : 'ai_unavailable',
      });
      return null;
    } finally {
      clearTimeout(slow);
      if (current.current === ctrl) current.current = null;
    }
  }

  /** The list before the last successful step, once; null when there is nothing to undo. */
  const undo = () => {
    setUndoTo(null);
    return undoTo?.snapshot ?? null;
  };

  return { sessionId, state, run, cancel, undo, canUndo: !!undoTo };
}
