import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

afterEach(cleanup);

const widths = () =>
  [...screen.getByRole('meter').children].map(
    (el) => (el as HTMLElement).style.width,
  );

describe('ProgressBar', () => {
  it('fills up to the value with no tail under the norm', () => {
    render(<ProgressBar value={525} max={2100} label="kcal" />);
    expect(widths()).toEqual(['25%']);
  });

  it('rescales to the value and hatches the overrun', () => {
    render(<ProgressBar value={2500} max={2000} label="kcal" />);
    expect(widths()).toEqual(['80%', '20%']);
  });

  it('shows no tail when the overrun rounds away', () => {
    render(<ProgressBar value={2100.4} max={2100} label="kcal" />);
    expect(widths()).toEqual(['100%']);
  });

  it('is empty at zero, and all tail with a zero norm', () => {
    render(<ProgressBar value={0} max={0} label="a" />);
    expect(widths()).toEqual(['0%']);
    cleanup();
    render(<ProgressBar value={10} max={0} label="b" />);
    expect(widths()).toEqual(['0%', '100%']);
  });
});
