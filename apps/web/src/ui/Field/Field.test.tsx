import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, LOCALE_STORAGE_KEY } from '../../i18n';
import { Field } from './Field';

afterEach(cleanup);

async function renderField(props: Parameters<typeof Field>[0]) {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
  render(
    <I18nProvider>
      <Field {...props} />
    </I18nProvider>,
  );
  return screen.findByLabelText(props.label);
}

describe('Field', () => {
  it('ties the label and the hint to the input', async () => {
    const input = await renderField({ label: 'Name', hint: 'Shown to others' });
    const note = document.getElementById(
      input.getAttribute('aria-describedby')!,
    );
    expect(note?.textContent).toBe('Shown to others');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('marks an error invalid and describes the input with it instead of the hint', async () => {
    const input = await renderField({
      label: 'Email',
      hint: 'Shown to others',
      error: 'Check the email',
    });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const note = document.getElementById(
      input.getAttribute('aria-describedby')!,
    );
    expect(note?.textContent).toBe('Check the email');
  });

  it('has no description without a hint or an error', async () => {
    const input = await renderField({ label: 'Name' });
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows and hides a password', async () => {
    const input = await renderField({ label: 'Password', type: 'password' });
    expect(input.getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input.getAttribute('type')).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input.getAttribute('type')).toBe('password');
  });

  it('makes a locked field read-only without the show button', async () => {
    const input = await renderField({
      label: 'Email',
      type: 'password',
      locked: true,
      defaultValue: 'me@example.com',
    });
    expect((input as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
