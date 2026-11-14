import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { calculateNorm, type Profile } from '@oct/shared';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import {
  AgentMessage,
  Composer,
  NormSummary,
  QuickReplies,
  TypingIndicator,
} from './AgentChat';

beforeEach(() => localStorage.setItem(LOCALE_STORAGE_KEY, 'en'));
afterEach(cleanup);

const profile: Profile = {
  sex: 'male',
  birthDate: '1996-03-14',
  heightCm: 180.34,
  weightKg: 80,
  activity: 'moderate',
  goal: 'lose',
  targetWeightKg: 75,
  deadline: null,
};
const norm = calculateNorm(profile, '2026-11-13');
if (norm.status !== 'ok') throw new Error('fixture must give a norm');

function TestComposer({ onSend }: { onSend: (text: string) => void }) {
  const [value, setValue] = useState('');
  return <Composer value={value} onChange={setValue} onSend={onSend} />;
}

describe('AgentChat', () => {
  it('a capsule answers with its own text', async () => {
    const onPick = vi.fn();
    render(
      <QuickReplies
        replies={[{ text: 'Male' }, { text: 'Female', primary: true }]}
        onPick={onPick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    expect(onPick).toHaveBeenCalledWith('Female', 1);
  });

  it('shows model markup as text, never as HTML', () => {
    const text = '<b>bold</b> <a href="https://evil.example">link</a>';
    const { container } = render(<AgentMessage>{text}</AgentMessage>);
    expect(container.querySelector('a, b')).toBeNull();
    expect(container.textContent).toBe(text);
  });

  it('splits model text into paragraphs by line breaks, still as text', () => {
    const { container } = render(
      <AgentMessage>{'First <b>x</b>\n\nSecond'}</AgentMessage>,
    );
    const ps = container.querySelectorAll('.chat-msg__text > p');
    expect([...ps].map((p) => p.textContent)).toEqual([
      'First <b>x</b>',
      'Second',
    ]);
    expect(container.querySelector('b')).toBeNull();
  });

  it('Enter sends the trimmed text; an empty field sends nothing', async () => {
    const onSend = vi.fn();
    render(<TestComposer onSend={onSend} />, { wrapper: I18nProvider });
    const field = await screen.findByRole('textbox');
    const send = screen.getByRole('button', { name: 'Send' });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(field, { target: { value: ' 34 years ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('34 years');
  });

  it('is disabled with its reason (9.8)', async () => {
    render(
      <Composer
        value="x"
        onChange={() => {}}
        onSend={() => {}}
        disabledText="Calculation is available from age 18"
      />,
      { wrapper: I18nProvider },
    );
    const field = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    expect(field.disabled).toBe(true);
    expect(field.placeholder).toBe('Calculation is available from age 18');
  });

  it('announces typing as a status', async () => {
    render(<TypingIndicator />, { wrapper: I18nProvider });
    expect((await screen.findByRole('status')).textContent).toBe(
      'Assistant is typing',
    );
  });

  it('shows the summary in pounds and feet for US units', async () => {
    render(
      <NormSummary
        draft={profile}
        norm={norm}
        units="us"
        onApply={() => {}}
        onFix={() => {}}
      />,
      { wrapper: I18nProvider },
    );
    expect(await screen.findByText('5′ 11″ · 176.4 lb')).toBeTruthy();
    expect(screen.getByText('Lose to 165.3 lb')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'How it’s calculated' })).toBe(
      null,
    );
  });

  it('a failed apply shows the error and retries (9.14)', async () => {
    const onApply = vi.fn();
    render(
      <NormSummary
        draft={profile}
        norm={norm}
        units="metric"
        failed
        onApply={onApply}
        onFix={() => {}}
      />,
      { wrapper: I18nProvider },
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Couldn’t apply the goal',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onApply).toHaveBeenCalledOnce();
  });
});
