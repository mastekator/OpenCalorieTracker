import { useId, useRef, type KeyboardEvent } from 'react';
import { Check, ChefHat, Sparkle } from 'lucide-react';
import { useT } from '../../i18n';
import './AiQuestion.css';

type Props = {
  text: string;
  /** `hint`: one of the user's recipes, «160 kcal/100 g» under its name (OCT-352 3.1). */
  options: readonly { label: string; hint?: string }[];
  /** The AI's guess: checked until the user picks (OCT-234 H.1). */
  guess: number;
  /** The option the user tapped; none: not answered yet. */
  chosen?: number;
  /** A tap on an option that is not checked; works offline (ADR-0020 §4). */
  onChoose: (option: number) => void;
  /** «Other…»: the free-text field takes over. */
  onOther: () => void;
  /** Why «Other…» waits (offline, limit): it stays focusable and says so (WCAG 4.1.2). */
  otherOff?: string;
};

/** The AI's question under a dish: answer chips, the guess checked, «Other…» (OCT-234 H). */
export function AiQuestion({
  text,
  options,
  guess,
  chosen,
  onChoose,
  onOther,
  otherOff,
}: Props) {
  const { t } = useT();
  const id = useId();
  const group = useRef<HTMLDivElement>(null);
  const checked = chosen ?? guess;
  const pick = (i: number) => i !== checked && onChoose(i);

  // As Segment: arrows move and select, the radios only.
  function onKeyDown(event: KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      event.key
    ];
    if (!step || (event.target as HTMLElement).getAttribute('role') !== 'radio')
      return;
    event.preventDefault();
    const next = (checked + step + options.length) % options.length;
    pick(next);
    const radios =
      group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[next]?.focus();
  }

  return (
    <div className="ai-question">
      <p className="ai-question__text" id={`${id}q`}>
        <Sparkle aria-hidden="true" className="ai-question__icon" />
        <span>
          <span className="ai-question__label">
            {t('edit.question.not_sure')}
          </span>{' '}
          {text}
        </span>
      </p>
      <div
        ref={group}
        className="ai-question__chips"
        role="radiogroup"
        aria-labelledby={`${id}q`}
        onKeyDown={onKeyDown}
      >
        {options.map((option, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i === checked}
            tabIndex={i === checked ? 0 : -1}
            className="ai-question__chip"
            aria-label={
              i === guess
                ? t('edit.question.guess', { option: option.label })
                : undefined
            }
            onClick={() => pick(i)}
          >
            {i === checked ? (
              <Check aria-hidden="true" />
            ) : (
              option.hint && <ChefHat aria-hidden="true" />
            )}
            {option.hint ? (
              <span className="ai-question__recipe">
                {option.label}
                <span className="ai-question__hint">{option.hint}</span>
              </span>
            ) : (
              option.label
            )}
          </button>
        ))}
        <button
          type="button"
          className="ai-question__chip ai-question__chip--other"
          aria-disabled={!!otherOff || undefined}
          aria-describedby={otherOff ? `${id}off` : undefined}
          title={otherOff}
          onClick={() => !otherOff && onOther()}
        >
          {t('edit.question.something_else')}
        </button>
        {otherOff && (
          <span id={`${id}off`} hidden>
            {otherOff}
          </span>
        )}
      </div>
    </div>
  );
}
