import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUp, Info, Sparkles, Target, type LucideIcon } from 'lucide-react';
import {
  cmToFtIn,
  weightFromKg,
  type NormResult,
  type Profile,
  type Units,
} from '@oct/shared';
import { useT } from '../../i18n';
import { DESKTOP_MEDIA } from '../../styles/breakpoints';
import { Banner } from '../Banner/Banner';
import { Button } from '../Button/Button';
import { MacroSplit } from '../MacroSplit/MacroSplit';
import './AgentChat.css';

/** Same limit as agentMessageRequestSchema. */
const MAX_LENGTH = 500;

function Avatar() {
  return (
    <span className="chat-msg__avatar" aria-hidden="true">
      <Sparkles />
    </span>
  );
}

/** The message list; new messages are announced politely. */
export function ChatFeed({ children }: { children: ReactNode }) {
  return (
    <div className="chat-feed" role="log" aria-live="polite">
      {children}
    </div>
  );
}

/** Agent message: icon and plain text, no bubble (OCT-22 §3). Strings render as text: model output never becomes HTML or a link. */
export function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <div className="chat-msg chat-msg--agent">
      <Avatar />
      <div className="chat-msg__text">{children}</div>
    </div>
  );
}

/** Centred footnote in the feed: the disclaimer as the first message (9.1). */
export function ChatNote({ children }: { children: ReactNode }) {
  return (
    <p className="chat-note">
      <Info aria-hidden="true" />
      {children}
    </p>
  );
}

export function UserMessage({ children }: { children: string }) {
  return <p className="chat-msg chat-msg--user">{children}</p>;
}

export type QuickReply = { text: string; primary?: boolean; icon?: LucideIcon };

/** Capsules under the last question; a tap answers with the capsule's text. */
export function QuickReplies({
  replies,
  onPick,
}: {
  replies: readonly QuickReply[];
  onPick: (text: string, index: number) => void;
}) {
  return (
    <div className="chat-replies">
      {replies.map(({ text, primary, icon: Icon }, i) => (
        <button
          key={text}
          type="button"
          className={`chat-reply${primary ? ' chat-reply--primary' : ''}`}
          onClick={() => onPick(text, i)}
        >
          {Icon && <Icon aria-hidden="true" />}
          {text}
        </button>
      ))}
    </div>
  );
}

export function TypingIndicator() {
  const { t } = useT();
  return (
    <div className="chat-msg chat-msg--agent">
      <Avatar />
      <div className="chat-typing" role="status">
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <span className="chat-typing__label">{t('chat.typing')}</span>
      </div>
    </div>
  );
}

type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  /** Called with the trimmed text; never with an empty one. */
  onSend: (text: string) => void;
  /** Disables input and shows this text instead of the placeholder (9.8, 9.11). */
  disabledText?: string;
};

/** Answer field and round send button. Enter sends; Shift + Enter is a new line on desktop only (D.2). */
export function Composer({
  value,
  onChange,
  onSend,
  disabledText,
}: ComposerProps) {
  const { t } = useT();
  const text = value.trim();
  const disabled = disabledText !== undefined;
  const send = () => {
    if (text && !disabled) onSend(text);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    if (event.shiftKey && window.matchMedia?.(DESKTOP_MEDIA).matches) return;
    event.preventDefault();
    send();
  };
  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <textarea
        className="chat-composer__field"
        rows={1}
        maxLength={MAX_LENGTH}
        enterKeyHint="send"
        aria-label={t('chat.placeholder')}
        placeholder={disabledText ?? t('chat.placeholder')}
        disabled={disabled}
        value={disabled ? '' : value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="submit"
        className="chat-composer__send"
        aria-label={t('chat.send')}
        disabled={disabled || !text}
      >
        <ArrowUp aria-hidden="true" />
      </button>
    </form>
  );
}

type SummaryProps = {
  draft: Profile;
  norm: Extract<NormResult, { status: 'ok' }>;
  units: Units;
  onApply: () => void;
  onFix: () => void;
  /** «How it's calculated»; hidden until the screen exists (OCT-89). */
  onHow?: () => void;
  /** Disclaimer text, unless the user hid it (8.21). */
  disclaimer?: boolean;
  applying?: boolean;
  /** 9.14: the apply request failed; the button becomes «Try again». */
  failed?: boolean;
};

/** Summary card in the chat (9.4, 9.14): collected fields in the user's units, the goal, Apply / Edit. */
export function NormSummary({
  draft,
  norm,
  units,
  onApply,
  onFix,
  onHow,
  disclaimer = false,
  applying = false,
  failed = false,
}: SummaryProps) {
  const { t, locale } = useT();
  const titleId = useId();
  const num1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const weight = (kg: number) =>
    `${num1.format(weightFromKg(kg, units))} ${t(units === 'us' ? 'unit.lb' : 'unit.kg')}`;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(iso));

  const rows: [string, string][] = [];
  if (draft.sex)
    rows.push([t('chat.summary.formula'), t(`field.${draft.sex}`)]);
  rows.push([
    t('chat.summary.age'),
    t('field.age', { count: norm.steps.ageYears }),
  ]);
  if (draft.heightCm !== null && draft.weightKg !== null) {
    const { ft, in: inches } = cmToFtIn(draft.heightCm);
    const height =
      units === 'us'
        ? `${ft}′ ${inches}″`
        : `${Math.round(draft.heightCm)} ${t('unit.cm')}`;
    rows.push([
      t('chat.summary.body'),
      `${height} · ${weight(draft.weightKg)}`,
    ]);
  }
  if (draft.activity)
    rows.push([t('activity.title'), t(`activity.${draft.activity}.name`)]);
  if (draft.goal) {
    const goal = t(`goal.${draft.goal}`);
    rows.push([
      t('goal.title'),
      draft.targetWeightKg === null
        ? goal
        : t('chat.summary.goal_to', {
            goal,
            weight: weight(draft.targetWeightKg),
          }),
    ]);
  }
  const pace = norm.pace;
  if (pace && draft.goal !== 'maintain') {
    const params = {
      x: weight(pace.kgPerWeek),
      p: num1.format(pace.pctPerWeek),
    };
    rows.push([
      t('goal.deadline'),
      pace.source === 'deadline' && draft.deadline
        ? t('goal.pace', { ...params, date: date(draft.deadline) })
        : pace.etaDate
          ? t('goal.eta', { ...params, date: date(pace.etaDate) })
          : t('goal.rate', params),
    ]);
  }

  return (
    <section className="chat-summary" aria-labelledby={titleId}>
      <h3 id={titleId} className="chat-summary__title">
        {t('chat.summary.title')}
      </h3>
      <dl className="chat-summary__rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="chat-summary__label">
        <Target aria-hidden="true" />
        {t('norm.title')}
      </p>
      <p className="chat-summary__kcal">
        <span className="chat-summary__number">
          {new Intl.NumberFormat(locale).format(norm.kcal)}
        </span>{' '}
        {t('norm.unit')}
      </p>
      <MacroSplit protein={norm.proteinG} fat={norm.fatG} carbs={norm.carbsG} />
      {pace?.level === 'fast' || pace?.level === 'danger' ? (
        <Banner tone="warning" title={t(`pace.${pace.level}.title`)}>
          {t(`pace.${pace.level}.body`)}
        </Banner>
      ) : pace?.level === 'gain_fast' ? (
        <Banner tone="warning">{t('pace.gain_fast')}</Banner>
      ) : null}
      {onHow && (
        <Button variant="plain" small onClick={onHow}>
          {t('norm.how')}
        </Button>
      )}
      {disclaimer && (
        <p className="chat-summary__note">
          <Info aria-hidden="true" />
          {t('norm.disclaimer')}
        </p>
      )}
      {failed && (
        <Banner tone="danger" title={t('chat.apply_error')}>
          {t('chat.apply_error_body')}
        </Banner>
      )}
      <div className="chat-summary__actions">
        <Button loading={applying} onClick={onApply}>
          {t(failed ? 'common.retry' : 'chat.apply')}
        </Button>
        <Button variant="plain" disabled={applying} onClick={onFix}>
          {t('chat.fix')}
        </Button>
      </div>
    </section>
  );
}
