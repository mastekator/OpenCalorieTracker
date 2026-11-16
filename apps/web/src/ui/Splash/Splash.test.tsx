import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { Link, Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import css from './Splash.css?raw';
import { Splash } from './Splash';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const splash = (c: HTMLElement) => c.querySelector('.splash');
// jsdom has no AnimationEvent, so React listens to the prefixed name there.
const animationEnd = (el: Element) =>
  fireEvent(el, new Event('webkitAnimationEnd', { bubbles: true }));

describe('Splash', () => {
  it('fades out after the name animation and unmounts after the fade', () => {
    const { container } = render(<Splash />);
    expect(splash(container)?.getAttribute('aria-hidden')).toBe('true');
    // A pea ending does not start the fade, the name does.
    animationEnd(container.querySelector('.mark__carbs')!);
    expect(splash(container)?.classList.contains('splash--fade')).toBe(false);
    animationEnd(container.querySelector('.splash__name')!);
    expect(splash(container)?.classList.contains('splash--fade')).toBe(true);
    fireEvent.transitionEnd(splash(container)!);
    expect(splash(container)).toBeNull();
  });

  it('a tap skips straight to the fade', () => {
    const { container } = render(<Splash />);
    fireEvent.pointerDown(splash(container)!);
    expect(splash(container)?.classList.contains('splash--fade')).toBe(true);
  });

  it('with zero durations (reduced motion) goes away by the timer, without events', () => {
    vi.useFakeTimers();
    const { container } = render(<Splash />);
    act(() => vi.advanceTimersByTime(299));
    expect(splash(container)).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(splash(container)).toBeNull();
  });

  it('reduced motion turns every keyframe off, so the final frame shows from the start', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.splash \*,\s*\.splash\s*{\s*animation: none !important;/,
    );
  });

  it('is shown once: navigating inside the app does not bring it back', () => {
    const { container, getByRole } = render(
      <Router hook={memoryLocation({ path: '/' }).hook}>
        <Splash />
        <Link href="/diary">Diary</Link>
        <Route path="/diary">diary</Route>
      </Router>,
    );
    animationEnd(container.querySelector('.splash__name')!);
    fireEvent.transitionEnd(splash(container)!);
    fireEvent.click(getByRole('link', { name: 'Diary' }));
    expect(container.textContent).toContain('diary');
    expect(splash(container)).toBeNull();
  });
});
