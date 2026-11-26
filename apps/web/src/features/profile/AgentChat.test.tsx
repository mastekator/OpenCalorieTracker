import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  calculateNorm,
  type AgentResponse,
  type ChatMessage,
  type InterviewState,
  type Profile,
} from '@oct/shared';
import { api, ApiError } from '../../api/client';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { renderLoaded } from '../../test-utils';
import { ToastProvider } from '../../ui/Toast/Toast';
import { AgentChat } from './AgentChat';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  api: vi.fn(),
}));
const apiMock = vi.mocked(api);

const today = '2026-11-13';
const empty: Profile = {
  sex: null,
  birthDate: null,
  heightCm: null,
  weightKg: null,
  activity: null,
  goal: null,
  targetWeightKg: null,
  deadline: null,
};
const full: Profile = {
  sex: 'male',
  birthDate: '1992-05-02',
  heightCm: 182,
  weightKg: 85,
  activity: 'moderate',
  goal: 'maintain',
  targetWeightKg: null,
  deadline: null,
};
const norm = calculateNorm(full, today);
if (norm.status !== 'ok') throw new Error('fixture must give a norm');

const reply = (
  messages: ChatMessage[],
  state: InterviewState = 'active',
): AgentResponse => ({
  messages,
  state,
  draft: { profile: full, unknown: [], paceWarned: null },
  userTurns: 1,
});
const user = (text: string): ChatMessage => ({
  role: 'user',
  kind: 'text',
  text,
});
const summary: ChatMessage[] = [
  { role: 'assistant', kind: 'text', text: 'Done, I have everything.' },
  { role: 'assistant', kind: 'summary', draft: full, norm },
];
const applied = { profile: full, manual: null, rev: 7 };

/** Fake server: GET answers `opening`, POSTs go to the handlers by path. */
function serve(
  opening: ChatMessage[],
  post: Record<string, (body: { text?: string; retry?: true }) => unknown> = {},
  state: InterviewState = 'active',
) {
  apiMock.mockImplementation(async (path, _schema, options) => {
    if (!options?.method) return reply(opening, state);
    const handler =
      post[`${options.method === 'POST' ? '' : `${options.method} `}${path}`];
    if (!handler) throw new Error(`unexpected ${options.method} ${path}`);
    return handler(options.body as { text?: string });
  });
}

async function setup(props: Partial<Parameters<typeof AgentChat>[0]> = {}) {
  const onApplied = vi.fn();
  const onManual = vi.fn();
  const onClose = vi.fn();
  const onForm = vi.fn();
  await renderLoaded(
    <I18nProvider>
      <AgentChat
        open
        onClose={onClose}
        units="metric"
        today={today}
        manualKcal={null}
        disclaimerHidden={false}
        onApplied={onApplied}
        onManual={onManual}
        onForm={onForm}
        {...props}
      />
    </I18nProvider>,
  );
  return { onApplied, onManual, onClose, onForm };
}

const send = (text: string) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
};

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(() => {
  cleanup();
  apiMock.mockReset();
});

describe('AgentChat (container)', () => {
  it('runs the dialog from the opening to the summary and applies it', async () => {
    serve([{ role: 'assistant', kind: 'opening', known: empty }], {
      '/api/norm-agent/messages': ({ text }) =>
        text === 'Male'
          ? reply([
              user('Male'),
              {
                role: 'assistant',
                kind: 'text',
                text: 'Noted <b>male</b>, see <a href="https://evil.example">this</a>',
                ask: 'birthDate',
              },
            ])
          : reply([user(text!), ...summary], 'summary'),
      '/api/norm-agent/apply': () => applied,
    });
    const { onApplied } = await setup();

    // 9.1: disclaimer, greeting and the first question with its capsules.
    expect(await screen.findByText(/This is an estimate/)).toBeTruthy();
    expect(
      screen.getByText('Which formula should I use — male or female?'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Male' }));

    // The capsule sends its own text and goes away.
    expect(apiMock).toHaveBeenCalledWith(
      '/api/norm-agent/messages',
      expect.anything(),
      { method: 'POST', body: { text: 'Male' } },
    );
    expect(screen.queryByRole('button', { name: 'Female' })).toBeNull();

    // The model reply is plain text: no markup, no link.
    const markup =
      'Noted <b>male</b>, see <a href="https://evil.example">this</a>';
    expect(await screen.findByText(markup)).toBeTruthy();
    expect(document.querySelector('.chat-feed a, .chat-feed b')).toBeNull();

    send('34, 182 cm, 85 kg, moderate, maintain');
    expect(
      await screen.findByText('Check that everything’s right'),
    ).toBeTruthy();
    // 9.4: the composer is gone while the summary is shown.
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Apply goal' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(applied));
  });

  it('asks before replacing a manual goal (9.5)', async () => {
    serve(summary, { '/api/norm-agent/apply': () => applied }, 'summary');
    const { onApplied } = await setup({ manualKcal: 2100 });

    fireEvent.click(await screen.findByRole('button', { name: 'Apply goal' }));
    expect(
      screen.getByText(`Apply ${norm.kcal.toLocaleString('en')} kcal goal?`),
    ).toBeTruthy();
    expect(
      screen.getByText('Your manual goal of 2,100 kcal will be replaced.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apiMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Apply goal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(applied));
  });

  it('keeps the summary when applying fails (9.14)', async () => {
    serve(
      summary,
      {
        '/api/norm-agent/apply': () => {
          throw new ApiError(0, 'network');
        },
      },
      'summary',
    );
    const { onApplied } = await setup();

    fireEvent.click(await screen.findByRole('button', { name: 'Apply goal' }));
    expect(await screen.findByText('Couldn’t apply the goal')).toBeTruthy();
    expect(screen.getByText('Check that everything’s right')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('greets a filled profile with what it has (9.6)', async () => {
    serve([{ role: 'assistant', kind: 'opening', known: full }]);
    await setup({ disclaimerHidden: true });

    expect(
      await screen.findByText(
        /^I have: male formula, 34 years, 182 cm, 85 kg, activity — [a-z]/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/This is an estimate/)).toBeNull();
    expect(screen.getByRole('button', { name: 'All correct' })).toBeTruthy();
  });

  it('a filled profile without a deadline is confirmed first, the deadline comes next (OCT-302)', async () => {
    const lose = { ...full, goal: 'lose' as const, targetWeightKg: 72 };
    serve([{ role: 'assistant', kind: 'opening', known: lose }], {
      '/api/norm-agent/messages': ({ text }) =>
        reply([
          user(text!),
          {
            role: 'assistant',
            kind: 'text',
            text: 'By what date do you want to reach 72 kg?',
            ask: 'deadline',
          },
        ]),
    });
    await setup({ disclaimerHidden: true });

    expect(await screen.findByText(/^I have: male formula/)).toBeTruthy();
    expect(screen.queryByText(/male, 34, 182 and 85/)).toBeNull();
    expect(screen.queryByText(/By what date/)).toBeNull();
    screen.getByRole('button', { name: 'My weight changed' });
    screen.getByRole('button', { name: 'Different goal' });
    fireEvent.click(screen.getByRole('button', { name: 'All correct' }));
    expect(
      await screen.findByText('By what date do you want to reach 72 kg?'),
    ).toBeTruthy();
  });

  it('one required field missing: the greeting and that question, no list (OCT-302)', async () => {
    serve([
      { role: 'assistant', kind: 'opening', known: { ...full, sex: null } },
    ]);
    await setup({ disclaimerHidden: true });

    expect(await screen.findByText(/male, 34, 182 and 85/)).toBeTruthy();
    expect(
      screen.getByText('Which formula should I use — male or female?'),
    ).toBeTruthy();
    expect(screen.queryByText(/^I have:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'All correct' })).toBeNull();
  });

  it('asks about units in words (9.7)', async () => {
    serve([
      {
        role: 'assistant',
        kind: 'unit_check',
        field: 'weightKg',
        value: 180,
        asUnit: 'lb',
        converted: 81.6,
      },
    ]);
    await setup();

    expect(
      await screen.findByText('Is 180 in pounds? That’s about 81.6 kg.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yes, pounds' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No, kilograms' })).toBeTruthy();
  });

  it('under 18: the field is off and the capsule leads to the manual goal (9.8)', async () => {
    serve([user('16'), { role: 'assistant', kind: 'minor' }], {}, 'minor');
    const { onManual } = await setup();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Set my own goal' }),
    );
    expect(onManual).toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(
      true,
    );
  });

  it('shows «Assistant is typing» while waiting for the reply', async () => {
    let answer: (r: AgentResponse) => void = () => {};
    serve([{ role: 'assistant', kind: 'opening', known: empty }], {
      '/api/norm-agent/messages': () =>
        new Promise((resolve) => (answer = resolve)),
    });
    await setup();

    await screen.findByRole('button', { name: 'Male' });
    send('male');
    expect(screen.getByRole('status').textContent).toBe('Assistant is typing');
    answer(
      reply([user('male'), { role: 'assistant', kind: 'text', text: 'Ok' }]),
    );
    expect(await screen.findByText('Ok')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

const opening: ChatMessage[] = [
  { role: 'assistant', kind: 'opening', known: empty },
];
const fail = (code: ConstructorParameters<typeof ApiError>[1]) => () => {
  throw new ApiError(code === 'network' ? 0 : 502, code);
};

describe('AgentChat errors and exits (OCT-91)', () => {
  it('retries a failed turn without a second copy of the message (9.9)', async () => {
    const handler = vi
      .fn()
      .mockImplementationOnce(fail('ai_invalid_response'))
      .mockImplementationOnce(() =>
        reply([{ role: 'assistant', kind: 'text', text: 'Got it' }]),
      );
    serve(opening, { '/api/norm-agent/messages': handler });
    await setup();
    await screen.findByRole('button', { name: 'Male' });

    send('male, 34');
    expect(
      await screen.findByText('Something went wrong, please try again'),
    ).toBeTruthy();
    expect(screen.getByText('male, 34')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Got it')).toBeTruthy();
    expect(handler).toHaveBeenLastCalledWith({ retry: true });
    expect(screen.getAllByText('male, 34')).toHaveLength(1);
    expect(
      screen.queryByText('Something went wrong, please try again'),
    ).toBeNull();
  });

  it.each([
    'ai_unavailable',
    'ai_quota_exceeded',
    'ai_not_configured',
    'ai_consent_required', // «Not now» in the consent sheet (OCT-178 2.4)
  ] as const)(
    '%s: the form instead of the field, with the draft (9.10)',
    async (code) => {
      serve(opening, { '/api/norm-agent/messages': fail(code) });
      const { onForm } = await setup();
      await screen.findByRole('button', { name: 'Male' });

      send('male');
      fireEvent.click(
        await screen.findByRole('button', { name: 'Fill in the form' }),
      );
      expect(screen.getByText('The AI isn’t available right now')).toBeTruthy();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(onForm).toHaveBeenCalledWith(full);
    },
  );

  it('agent_closed: only the form and a fresh start', async () => {
    serve(opening, { '/api/norm-agent/messages': fail('agent_closed') });
    await setup();
    await screen.findByRole('button', { name: 'Male' });

    send('male');
    expect(
      await screen.findByRole('button', { name: 'Go to the form' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start over' })).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a message that never reached the server goes back into the field', async () => {
    serve(opening, {
      '/api/norm-agent/messages': (body) =>
        fail(body.retry ? 'agent_not_ready' : 'network')(),
    });
    await setup();
    await screen.findByRole('button', { name: 'Male' });

    send('male, 34');
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
        'male, 34',
      ),
    );
    expect(
      screen.queryByText('male, 34', { selector: '.chat-msg--user' }),
    ).toBeNull();
    expect(
      screen.queryByText('Something went wrong, please try again'),
    ).toBeNull();
  });

  it('offline: the chat bar, the field off; back online it works again (9.11)', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    serve(opening, { '/api/norm-agent/messages': fail('network') });
    await setup();
    await screen.findByRole('button', { name: 'Male' });

    onLine.mockReturnValue(false);
    send('male');
    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByText('Offline · chat saved')).toBeTruthy();
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(field.disabled).toBe(true);
    expect(field.placeholder).toBe('The assistant can’t reply offline');
    expect(
      screen.queryByText('Something went wrong, please try again'),
    ).toBeNull();

    onLine.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox') as HTMLTextAreaElement).disabled,
      ).toBe(false),
    );
    expect(screen.queryByText('Offline · chat saved')).toBeNull();
    onLine.mockRestore();
  });

  it('offers the form after 20 messages; «Continue here» hides the offer (9.12)', async () => {
    serve([user('again'), { role: 'assistant', kind: 'limit' }]);
    const { onForm } = await setup();

    expect(
      await screen.findByText(/This is taking a while in chat/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Go to the form' }));
    expect(onForm).toHaveBeenCalledWith(full);
    fireEvent.click(screen.getByRole('button', { name: 'Continue here' }));
    expect(screen.queryByRole('button', { name: 'Go to the form' })).toBeNull();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('«Start over» clears the dialog and leaves the profile alone (9.13)', async () => {
    let feed: ChatMessage[] = [
      user('male'),
      { role: 'assistant', kind: 'text', text: 'Noted' },
    ];
    apiMock.mockImplementation(async (path, _schema, options) => {
      if (!options?.method) return reply(feed);
      if (options.method === 'DELETE' && path === '/api/norm-agent') {
        feed = opening;
        return undefined;
      }
      throw new Error(`unexpected ${options.method} ${path}`);
    });
    await setup();
    expect(await screen.findByText('Noted')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(
      screen.getByText(
        'The chat will be cleared. Your profile and goal stay the same.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));

    expect(await screen.findByRole('button', { name: 'Male' })).toBeTruthy();
    expect(screen.queryByText('Noted')).toBeNull();
    expect(apiMock.mock.calls.map(([path]) => path)).not.toContain(
      '/api/profile',
    );
  });

  it('a failed «Start over» keeps the dialog and shows a toast (9.13)', async () => {
    apiMock.mockImplementation(async (_path, _schema, options) => {
      if (!options?.method)
        return reply([
          user('male'),
          { role: 'assistant', kind: 'text', text: 'Noted' },
        ]);
      throw new ApiError(0, 'network');
    });
    await renderLoaded(
      <I18nProvider>
        <ToastProvider>
          <AgentChat
            open
            onClose={vi.fn()}
            units="metric"
            today={today}
            manualKcal={null}
            disclaimerHidden={false}
            onApplied={vi.fn()}
            onManual={vi.fn()}
            onForm={vi.fn()}
          />
        </ToastProvider>
      </I18nProvider>,
    );
    expect(await screen.findByText('Noted')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(
      await screen.findByText('Something went wrong, please try again'),
    ).toBeTruthy();
    expect(screen.getByText('Noted')).toBeTruthy();
  });
});
