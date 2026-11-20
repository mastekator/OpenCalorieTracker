import { Check, CircleAlert, Minus } from 'lucide-react';
import './RecognitionSteps.css';

/** wait: ahead · run: now · done: gave a result · skip: not needed / none / off · warn: an outside service failed. */
export type StepMarkKind = 'wait' | 'run' | 'done' | 'skip' | 'warn';

const ICONS = { done: Check, skip: Minus, warn: CircleAlert } as const;

/** The status mark of a recognition step (OCT-313 §1); decorative, the caption says it. */
export function StepMark({ kind }: { kind: StepMarkKind }) {
  const Icon = kind in ICONS ? ICONS[kind as keyof typeof ICONS] : null;
  return (
    <span className={`step-mark step-mark--${kind}`} aria-hidden="true">
      {Icon && <Icon />}
    </span>
  );
}

export type Step = { title: string; caption?: string; mark: StepMarkKind };

/**
 * «Barcode → Open Food Facts → AI» under «Recognizing…» (OCT-313 §1).
 * A polite live list: a new caption is read once, the spinning mark is not.
 */
export function RecognitionSteps({
  steps,
  label,
  marks,
}: {
  steps: Step[];
  label: string;
  /** Spoken state of a step without a caption — the mark itself is hidden. */
  marks: Record<StepMarkKind, string>;
}) {
  return (
    <ol className="recog-steps" aria-label={label} aria-live="polite">
      {steps.map((s) => (
        <li key={s.title} className={`recog-steps__step is-${s.mark}`}>
          <StepMark kind={s.mark} />
          <span className="recog-steps__title">{s.title}</span>
          {s.caption ? (
            <span className="recog-steps__caption">{s.caption}</span>
          ) : (
            <span className="recog-steps__sr">{marks[s.mark]}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
