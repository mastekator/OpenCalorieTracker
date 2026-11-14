import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pencil } from 'lucide-react';
import { z } from 'zod';
import {
  activitySchema,
  ageYears,
  cmToFtIn,
  goalSchema,
  nextField,
  weightFromKg,
  type AgentResponse,
  type AssistantMessage,
  type ChatMessage,
  type InterviewField,
  type InterviewState,
  type Profile,
  type ProfileResponse,
  type Units,
} from '@oct/shared';
import { api } from '../../api/client';
import { useT } from '../../i18n';
import {
  AgentMessage,
  ChatFeed,
  ChatNote,
  Composer,
  NormSummary,
  QuickReplies,
  TypingIndicator,
  UserMessage,
  type QuickReply,
} from '../../ui/AgentChat/AgentChat';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { HowCalculated } from '../../ui/HowCalculated/HowCalculated';
import { Sheet } from '../../ui/Sheet/Sheet';

// Our own server: trust the shape, as data/sync.ts does.
const agentResponse = z.custom<AgentResponse>();
const profileResponse = z.custom<ProfileResponse>();

type Props = {
  open: boolean;
  /** × and swipe down: no question asked, the dialog stays on the server (AC-5.10). */
  onClose: () => void;
  units: Units;
  /** Local date, YYYY-MM-DD. */
  today: string;
  /** The manual goal in force: applying replaces it, so 9.5 asks first. */
  manualKcal: number | null;
  disclaimerHidden: boolean;
  /** The saved profile from POST /apply; the screen closes the chat. */
  onApplied: (profile: ProfileResponse) => void;
  /** 9.8 «Set my own goal». */
  onManual: () => void;
};

type Rendered = {
  node: ReactNode;
  replies?: (QuickReply & { act?: () => void })[];
};

/** Norm assistant chat (OCT-22 §3, ADR-0015 §5): the dialog from the server, structured messages from the dictionary. */
export function AgentChat({
  open,
  onClose,
  units,
  today,
  manualKcal,
  disclaimerHidden,
  onApplied,
  onManual,
}: Props) {
  const { t, locale } = useT();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<InterviewState>('active');
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyFailed, setApplyFailed] = useState(false);
  const [how, setHow] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // shortcut: load, send and edit errors are OCT-91; until then a failed turn just reloads the dialog.
  const load = useCallback(
    () =>
      api('/api/norm-agent', agentResponse).then(
        (r) => {
          setMessages(r.messages);
          setState(r.state);
        },
        () => {},
      ),
    [],
  );
  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setHow(false);
    setApplyFailed(false);
    void load();
  }, [open, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, typing]);

  async function send(body: string) {
    if (typing) return;
    setText('');
    setMessages((m) => [...m, { role: 'user', kind: 'text', text: body }]);
    setTyping(true);
    try {
      const r = await api('/api/norm-agent/messages', agentResponse, {
        method: 'POST',
        body: { text: body },
      });
      // The turn's messages start with the saved copy of the user's one.
      setMessages((m) => [...m.slice(0, -1), ...r.messages]);
      setState(r.state);
    } catch {
      await load();
    } finally {
      setTyping(false);
    }
  }

  async function edit() {
    try {
      const r = await api('/api/norm-agent/edit', agentResponse, {
        method: 'POST',
      });
      setMessages((m) => [...m, ...r.messages]);
      setApplyFailed(false);
      setState(r.state);
    } catch {
      await load();
    }
  }

  async function apply() {
    setConfirm(false);
    setApplying(true);
    setApplyFailed(false);
    try {
      onApplied(
        await api('/api/norm-agent/apply', profileResponse, { method: 'POST' }),
      );
    } catch {
      setApplyFailed(true);
    } finally {
      setApplying(false);
    }
  }

  const num1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(iso));
  const weightUnit = t(units === 'us' ? 'unit.lb' : 'unit.kg');
  const height = (cm: number) => {
    if (units === 'metric') return `${Math.round(cm)} ${t('unit.cm')}`;
    const { ft, in: inches } = cmToFtIn(cm);
    return `${ft}′ ${inches}″`;
  };
  const weight = (kg: number) =>
    `${num1.format(weightFromKg(kg, units))} ${weightUnit}`;

  const capsules = (ask: InterviewField | undefined): QuickReply[] => {
    if (ask === 'sex')
      return [{ text: t('field.male') }, { text: t('field.female') }];
    if (ask === 'activity')
      return activitySchema.options.map((a) => ({
        text: t(`activity.${a}.name`),
      }));
    if (ask === 'goal')
      return goalSchema.options.map((g) => ({ text: t(`goal.${g}`) }));
    if (ask === 'targetWeightKg' || ask === 'deadline')
      return [{ text: t('chat.dont_know') }];
    return [];
  };

  /** 9.6: what the saved profile already says. */
  const known = (p: Profile) =>
    new Intl.ListFormat(locale, { type: 'unit' }).format(
      [
        p.sex && t(`chat.known_sex.${p.sex}`),
        p.birthDate && t('field.age', { count: ageYears(p.birthDate, today) }),
        p.heightCm !== null && height(p.heightCm),
        p.weightKg !== null && weight(p.weightKg),
        p.activity &&
          t('chat.known_activity', {
            name: t(`activity.${p.activity}.name`),
          }),
        p.goal &&
          t('chat.known_goal', {
            name:
              p.targetWeightKg === null
                ? t(`goal.${p.goal}`)
                : t('chat.summary.goal_to', {
                    goal: t(`goal.${p.goal}`),
                    weight: weight(p.targetWeightKg),
                  }),
          }),
      ].filter((s): s is string => !!s),
    );

  const invalidText = (m: Extract<AssistantMessage, { kind: 'invalid' }>) => {
    const { field, min, max } = m;
    if (field === 'birthDate') return t('chat.invalid.birthDate');
    if (field === 'deadline' && min !== undefined && max !== undefined)
      return t('chat.invalid.deadline', {
        min: date(String(min)),
        max: date(String(max)),
      });
    const fmt = (n: number | string | undefined) => num1.format(Number(n));
    if (field === 'targetWeightKg')
      return max !== undefined
        ? t('chat.invalid.target_max', { max: fmt(max), unit: weightUnit })
        : t('chat.invalid.target_min', { min: fmt(min), unit: weightUnit });
    if (field === 'heightCm' || field === 'weightKg')
      return t('chat.invalid.range', {
        field: t(field === 'heightCm' ? 'field.height' : 'field.weight'),
        min: fmt(min),
        max: fmt(max),
        unit:
          field === 'weightKg'
            ? weightUnit
            : t(units === 'us' ? 'unit.in' : 'unit.cm'),
      });
    return t('chat.invalid.fallback');
  };

  const lastSummary = messages.findLast(
    (m) => m.role === 'assistant' && m.kind === 'summary',
  ) as Extract<AssistantMessage, { kind: 'summary' }> | undefined;

  function render(m: ChatMessage, last: boolean): Rendered {
    if (m.role === 'user') return { node: <UserMessage>{m.text}</UserMessage> };
    switch (m.kind) {
      case 'text':
        return {
          node: <AgentMessage>{m.text}</AgentMessage>,
          replies: capsules(m.ask),
        };
      case 'opening': {
        const ask = nextField({ profile: m.known, unknown: [] });
        const note = !disclaimerHidden && (
          <ChatNote>{t('norm.disclaimer')}</ChatNote>
        );
        if (ask)
          return {
            node: (
              <>
                {note}
                <AgentMessage>
                  {`${t('chat.greeting')}\n${t(`chat.ask.${ask}`)}`}
                </AgentMessage>
              </>
            ),
            replies: capsules(ask),
          };
        return {
          node: (
            <>
              {note}
              <AgentMessage>
                {t('chat.known', { list: known(m.known) })}
              </AgentMessage>
            </>
          ),
          replies: [
            { text: t('chat.known_ok') },
            { text: t('chat.known_weight') },
            { text: t('chat.known_goal_change') },
          ],
        };
      }
      case 'invalid':
        return { node: <AgentMessage>{invalidText(m)}</AgentMessage> };
      case 'unit_check': {
        const own = { cm: 'in', in: 'cm', kg: 'lb', lb: 'kg' } as const;
        const unit = t(`chat.units.${m.asUnit}`);
        return {
          node: (
            <AgentMessage>
              {t('chat.unit_check', {
                value: num1.format(m.value),
                unit,
                converted: num1.format(m.converted),
                own: t(`unit.${own[m.asUnit]}`),
              })}
            </AgentMessage>
          ),
          replies: [
            { text: t('chat.unit_yes', { unit }) },
            {
              text: t('chat.unit_no', {
                unit: t(`chat.units.${own[m.asUnit]}`),
              }),
            },
          ],
        };
      }
      case 'pace': {
        const keep = { text: t('chat.pace_keep', { date: date(m.deadline) }) };
        return {
          node: (
            <AgentMessage>
              {`${t(`pace.${m.level}.title`)}. ${t(`pace.${m.level}.body`)}\n${
                m.safeDeadline
                  ? t('chat.pace_safe', { date: date(m.safeDeadline) })
                  : t('chat.pace_no_safe')
              }`}
            </AgentMessage>
          ),
          replies: m.safeDeadline
            ? [
                { text: t('chat.pace_to', { date: date(m.safeDeadline) }) },
                keep,
              ]
            : [keep],
        };
      }
      case 'minor':
        return {
          node: (
            <AgentMessage>{`${t('norm.minor')}\n${t('norm.minor_body')}`}</AgentMessage>
          ),
          replies: [
            {
              text: t('chat.manual'),
              primary: true,
              icon: Pencil,
              act: onManual,
            },
          ],
        };
      case 'summary': {
        const card = (
          <NormSummary
            draft={m.draft}
            norm={m.norm}
            units={units}
            disclaimer={!disclaimerHidden}
            applying={last && applying}
            failed={last && applyFailed}
            onApply={() => (manualKcal === null ? apply() : setConfirm(true))}
            onFix={edit}
            onHow={() => setHow(true)}
          />
        );
        // An earlier summary stays readable but can't be acted on.
        return { node: last ? card : <div inert>{card}</div> };
      }
      case 'edit':
        return { node: <AgentMessage>{t('chat.edit')}</AgentMessage> };
      case 'limit':
        // shortcut: the 20-message offer is OCT-91.
        return { node: null };
    }
  }

  const lastIndex = messages.length - 1;
  const lastReplies =
    lastIndex >= 0 && !typing ? render(messages[lastIndex]!, true).replies : [];

  return (
    <>
      <Sheet
        open={open}
        full
        title={t('chat.title')}
        onClose={onClose}
        footer={
          !how &&
          state !== 'summary' && (
            <Composer
              value={text}
              onChange={setText}
              onSend={(body) => void send(body)}
              disabledText={
                state === 'minor' ? t('chat.minor_disabled') : undefined
              }
            />
          )
        }
      >
        {how && lastSummary ? (
          <>
            <Button variant="plain" small onClick={() => setHow(false)}>
              {t('chat.back')}
            </Button>
            <HowCalculated
              units={units}
              manualKcal={manualKcal}
              profile={lastSummary.draft}
              norm={lastSummary.norm}
            />
          </>
        ) : (
          <ChatFeed>
            {messages.map((m, i) => (
              <Fragment key={i}>{render(m, i === lastIndex).node}</Fragment>
            ))}
            {lastReplies && lastReplies.length > 0 && (
              <QuickReplies
                replies={lastReplies}
                onPick={(reply, i) => {
                  const act = lastReplies[i]!.act;
                  if (act) act();
                  else void send(reply);
                }}
              />
            )}
            {typing && <TypingIndicator />}
            <div ref={endRef} />
          </ChatFeed>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirm}
        tone="primary"
        title={t('chat.replace.title')}
        body={t('chat.replace.body', {
          n: new Intl.NumberFormat(locale).format(manualKcal ?? 0),
        })}
        confirmLabel={t('chat.replace.confirm')}
        onConfirm={() => void apply()}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
