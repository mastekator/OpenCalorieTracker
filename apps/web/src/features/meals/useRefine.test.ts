import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { SLOW_MS } from './RecognitionScreen';
import { useRefine } from './useRefine';

const answer = {
  dishes: [
    {
      name: 'Tea',
      grams: 200,
      kcal: 2,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
      confidence: 0.9,
    },
  ],
  questions: [],
  left: null,
};
const input = { mode: 'refine' as const, text: 'no sugar', dishes: [] };

/** A fetch whose answers the test hands out by hand; each call is kept with its body. */
function manualFetch() {
  const calls: {
    body: { requestId: string; sessionId: string };
    settle: (r: Response | Error) => void;
  }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const settle = (r: Response | Error) =>
            r instanceof Error ? reject(r) : resolve(r);
          init.signal?.addEventListener('abort', () =>
            reject(init.signal!.reason),
          );
          calls.push({ body: JSON.parse(init.body as string), settle });
        }),
    ),
  );
  return calls;
}
const ok = () => new Response(JSON.stringify(answer), { status: 200 });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useRefine', () => {
  it('is busy, then slow after 10 s, then idle with the answer and an undo', async () => {
    const calls = manualFetch();
    const { result } = renderHook(() => useRefine<string>());
    vi.useFakeTimers();
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.run(input, 'before');
    });
    expect(result.current.state).toEqual({ status: 'busy' });
    act(() => vi.advanceTimersByTime(SLOW_MS));
    expect(result.current.state).toEqual({ status: 'slow' });

    await act(async () => calls[0]!.settle(ok()));
    expect(await done).toEqual(answer);
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(calls[0]!.body.sessionId).toBe(result.current.sessionId);
    expect(result.current.canUndo).toBe(true);
    let undone: string | null = null;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe('before');
    expect(result.current.canUndo).toBe(false);
  });

  it('«Cancel» drops a late answer', async () => {
    const calls = manualFetch();
    const { result } = renderHook(() => useRefine<string>());
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.run(input, 'before');
    });
    act(() => result.current.cancel());
    await act(async () => calls[0]!.settle(ok()));
    expect(await done).toBeNull();
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(result.current.canUndo).toBe(false);
  });

  it('shows the error code and keeps nothing to undo', async () => {
    const calls = manualFetch();
    const { result } = renderHook(() => useRefine<string>());
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.run(input, 'before');
    });
    await act(async () =>
      calls[0]!.settle(
        new Response(JSON.stringify({ error: { code: 'ai_empty_result' } }), {
          status: 422,
        }),
      ),
    );
    expect(await done).toBeNull();
    expect(result.current.state).toEqual({
      status: 'error',
      code: 'ai_empty_result',
    });
    expect(result.current.canUndo).toBe(false);
  });

  it('a dropped request is retried once when back online, with the same requestId', async () => {
    const calls = manualFetch();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useRefine<string>());
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.run(input, 'before');
    });
    await act(async () => calls[0]!.settle(new TypeError('Failed to fetch')));
    expect(calls).toHaveLength(1);
    expect(result.current.state).toEqual({ status: 'busy' });

    online.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body.requestId).toBe(calls[0]!.body.requestId);

    // The second drop is an error, not another retry.
    await act(async () => calls[1]!.settle(new TypeError('Failed to fetch')));
    expect(await done).toBeNull();
    expect(result.current.state).toEqual({ status: 'error', code: 'network' });
  });

  it('«Cancel» while waiting for the network ends the request', async () => {
    const calls = manualFetch();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useRefine<string>());
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.run(input, 'before');
    });
    await act(async () => calls[0]!.settle(new TypeError('Failed to fetch')));
    act(() => result.current.cancel());
    expect(await done).toBeNull();
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('a new request gets a new requestId in the same session', async () => {
    const calls = manualFetch();
    const { result } = renderHook(() => useRefine<string>());
    act(() => void result.current.run(input, 'a'));
    await act(async () => calls[0]!.settle(ok()));
    act(() => void result.current.run(input, 'b'));
    expect(calls[1]!.body.requestId).not.toBe(calls[0]!.body.requestId);
    expect(calls[1]!.body.sessionId).toBe(calls[0]!.body.sessionId);
  });
});
