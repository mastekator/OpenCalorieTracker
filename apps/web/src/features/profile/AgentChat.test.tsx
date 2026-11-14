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
  post: Record<string, (body: { text?: string }) => unknown> = {},
  state: InterviewState = 'active',
) {
  apiMock.mockImplementation(async (path, _schema, options) => {
    if (!options?.method) return reply(opening, state);
    const handler = post[path];
    if (!handler) throw new Error(`unexpected ${path}`);
    return handler(options.body as { text?: string });
  });
}

async function setup(props: Partial<Parameters<typeof AgentChat>[0]> = {}) {
  const onApplied = vi.fn();
  const onManual = vi.fn();
  const onClose = vi.fn();
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
        {...props}
      />
    </I18nProvider>,
  );
  return { onApplied, onManual, onClose };
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
    expect(screen.getByText(/2,100 kcal set manually/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apiMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Apply goal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
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
      await screen.findByText(/^I have: male formula, 34 years, 182 cm, 85 kg/),
    ).toBeTruthy();
    expect(screen.queryByText(/This is an estimate/)).toBeNull();
    expect(screen.getByRole('button', { name: 'All correct' })).toBeTruthy();
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
