import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { List } from '../List/List';
import { FormRow, HeightFtIn, InlineNumber, parseDecimal } from './FormList';

afterEach(cleanup);

describe('parseDecimal', () => {
  it('reads comma and dot as the same number', () => {
    expect(parseDecimal('80,5')).toBe(80.5);
    expect(parseDecimal('80.5')).toBe(80.5);
    expect(parseDecimal('80,')).toBe(80);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal(',')).toBeNull();
  });
});

describe('InlineNumber', () => {
  it('reports the same number for a comma and a dot, rejects letters', async () => {
    const onChange = vi.fn();
    render(
      <List>
        <FormRow label="Weight">
          <InlineNumber
            label="Weight"
            value={null}
            onChange={onChange}
            unit="kg"
            decimals={1}
          />
        </FormRow>
      </List>,
      { wrapper: I18nProvider },
    );
    const input = await screen.findByRole('textbox', { name: 'Weight' });
    expect(input.getAttribute('inputmode')).toBe('decimal');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '80,5' } });
    fireEvent.change(input, { target: { value: '80.5' } });
    expect(onChange.mock.calls).toEqual([[80.5], [80.5]]);
    fireEvent.change(input, { target: { value: '80a' } });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect((input as HTMLInputElement).value).toBe('80.5');
  });

  it('shows the value with its decimals when not focused', async () => {
    render(
      <InlineNumber
        label="Weight"
        value={80}
        onChange={() => {}}
        decimals={1}
      />,
      { wrapper: I18nProvider },
    );
    const input = await screen.findByRole('textbox', { name: 'Weight' });
    expect((input as HTMLInputElement).value).toBe('80.0');
  });
});

describe('HeightFtIn', () => {
  function Harness() {
    const [value, setValue] = useState<{
      ft: number | null;
      in: number | null;
    }>({ ft: 5, in: 11 });
    return <HeightFtIn label="Height" value={value} onChange={setValue} />;
  }

  it('marks 12 inches as an error, 11 is fine', async () => {
    render(<Harness />, { wrapper: I18nProvider });
    const inches = await screen.findByRole('textbox', {
      name: 'Height, inches',
    });
    expect(inches.getAttribute('aria-invalid')).toBeNull();
    fireEvent.focus(inches);
    fireEvent.change(inches, { target: { value: '12' } });
    expect(inches.getAttribute('aria-invalid')).toBe('true');
    // Whole numbers only.
    fireEvent.change(inches, { target: { value: '1.5' } });
    expect((inches as HTMLInputElement).value).toBe('12');
  });
});
