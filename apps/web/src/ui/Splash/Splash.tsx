import { useEffect, useState, type AnimationEvent } from 'react';
import { Mark } from '../Mark/Mark';
import './Splash.css';

/** A CSS time token of the root in ms; 0 when absent (tests) or reduced motion. */
function tokenMs(name: string) {
  return (
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(name),
    ) || 0
  );
}

// Over --duration-splash + --duration-base, so a missed animationend (tab in the background) can't leave it stuck.
const SAFETY_MARGIN_MS = 300;

/**
 * Launch intro (OCT-217) over the loading app. Mount once per page load (App): it plays,
 * cross-fades out and unmounts itself; a tap skips to the fade. The app below never waits for it.
 */
export function Splash() {
  const [phase, setPhase] = useState<'play' | 'fade' | 'done'>('play');

  useEffect(() => {
    const ms =
      tokenMs('--duration-splash') +
      tokenMs('--duration-base') +
      SAFETY_MARGIN_MS;
    const id = setTimeout(() => setPhase('done'), ms);
    return () => clearTimeout(id);
  }, []);

  if (phase === 'done') return null;
  const fade = () => setPhase('fade');
  return (
    <div
      className={phase === 'fade' ? 'splash splash--fade' : 'splash'}
      aria-hidden="true"
      onPointerDown={fade}
      onAnimationEnd={(e: AnimationEvent) => {
        // The name's animation ends last.
        if ((e.target as Element).classList.contains('splash__name')) fade();
      }}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget) setPhase('done');
      }}
    >
      <Mark />
      <span className="splash__name">
        opencalorie<span>tracker</span>
      </span>
    </div>
  );
}
