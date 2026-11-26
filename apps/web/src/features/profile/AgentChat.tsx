import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Ellipsis, Pencil } from 'lucide-react';
import { z } from 'zod';
import {
  activitySchema,
  ageYears,
  cmToFtIn,
  goalSchema,
  REQUIRED_FIELDS,
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
import { api, ApiError } from '../../api/client';
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
import { Banner } from '../../ui/Banner/Banner';
import { Button } from '../../ui/Button/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { HowCalculated } from '../../ui/HowCalculated/HowCalculated';
import { OfflineBar, useOnline } from '../../ui/OfflineBar/OfflineBar';
import { Sheet } from '../../ui/Sheet/Sheet';
import { useToast } from '../../ui/Toast/Toast';
import { useAiConsent } from '../ai/AiConsent';

// Our own server: trust the shape, as data/sync.ts does.
const agentResponse = z.custom<AgentResponse>();
const profileResponse = z.custom<ProfileResponse>();
const noContent = z.custom<undefined>();

/** 9.10: the model is gone, the form takes over (E-5.2). */
const AI_DOWN = new Set([
  'ai_unavailable',
  'ai_quota_exceeded',
  'ai_not_configured',
  'ai_consent_required', // «Not now»: the form (OCT-178 2.4)
]);

/** 9.9 retry banner, 9.10 AI gone, `agent_closed`: only the form or a fresh start. */
type Failure = 'retry' | 'ai_down' | 'closed';

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
  /** «Go to the form» (9.10, 9.12, 9.13): the screen closes the chat and puts the draft into the form. */
  onForm: (draft: Profile | null) => void;
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
  onForm,
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
  const [draft, setDraft] = useState<Profile | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [menu, setMenu] = useState(false);
  // «Continue here» (9.12) hides the offer's capsules; the server makes it once.
  const [dismissed, setDismissed] = useState(-1);
  // The last text sent, until the server has answered it.
  const pending = useRef<string | null>(null);
  const online = useOnline();
  const toast = useToast();
  const withConsent = useAiConsent();
  const endRef = useRef<HTMLDivElement>(null);

  const take = (r: AgentResponse) => {
    setState(r.state);
    setDraft(r.draft.profile);
  };
  const load = useCallback(
    () =>
      api('/api/norm-agent', agentResponse).then(
        (r) => {
          setMessages(r.messages);
          take(r);
          return r.messages;
        },
        () => null,
      ),
    [],
  );
  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setHow(false);
    setApplyFailed(false);
    setFailure(null);
    setDismissed(-1);
    pending.current = null;
    void load();
  }, [open, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, typing]);

  /** A new message, or `null` to retry the last one (9.9): the server already has it, so nothing is added. */
  async function turn(body: string | null) {
    if (typing) return;
    setFailure(null);
    if (body !== null) {
      pending.current = body;
      setText('');
      setMessages((m) => [...m, { role: 'user', kind: 'text', text: body }]);
    }
    setTyping(true);
    try {
      const r = await withConsent('agent', () =>
        api('/api/norm-agent/messages', agentResponse, {
          method: 'POST',
          body: body === null ? { retry: true } : { text: body },
        }),
      );
      // A new turn's messages start with the saved copy of the user's one.
      setMessages((m) => [
        ...(body === null ? m : m.slice(0, -1)),
        ...r.messages,
      ]);
      take(r);
      pending.current = null;
    } catch (error) {
      await fail(error);
    } finally {
      setTyping(false);
    }
  }

  async function fail(error: unknown) {
    const code = error instanceof ApiError ? error.code : 'internal';
    if (AI_DOWN.has(code)) return setFailure('ai_down');
    if (code === 'agent_closed') return setFailure('closed');
    if (code !== 'agent_not_ready') return setFailure('retry');
    // Nothing to answer: either the reply is saved already (the response was lost)
    // or the message never reached the server. Show the saved dialog, keep the text.
    const sent = pending.current;
    pending.current = null;
    const saved = await load();
    if (
      sent &&
      saved &&
      saved.findLast((m) => m.role === 'user')?.text !== sent
    )
      setText(sent);
  }

  async function restart() {
    setMenu(false);
    try {
      await api('/api/norm-agent', noContent, { method: 'DELETE' });
    } catch {
      // The dialog stays as it was.
      return toast({ text: t('chat.retry_error') });
    }
    setMessages([]);
    setFailure(null);
    setDismissed(-1);
    pending.current = null;
    await load();
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
    if (units === 'metric') return `${Math.round(cm)}\u00a0${t('unit.cm')}`;
    const { ft, in: inches } = cmToFtIn(cm);
    return `${ft}′\u00a0${inches}″`;
  };
  const weight = (kg: number) =>
    // No-break space: a value never wraps away from its unit.
    `${num1.format(weightFromKg(kg, units))}\u00a0${weightUnit}`;

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
  const lower = (s: string) => s.toLocaleLowerCase(locale);
  const known = (p: Profile) =>
    [
      p.sex && t(`chat.known_sex.${p.sex}`),
      p.birthDate && t('field.age', { count: ageYears(p.birthDate, today) }),
      p.heightCm !== null && height(p.heightCm),
      p.weightKg !== null && weight(p.weightKg),
      p.activity &&
        t('chat.known_activity', {
          name: lower(t(`activity.${p.activity}.name`)),
        }),
      p.goal &&
        t('chat.known_goal', {
          name:
            p.targetWeightKg === null
              ? lower(t(`goal.${p.goal}`))
              : t('chat.summary.goal_to', {
                  goal: lower(t(`goal.${p.goal}`)),
                  weight: weight(p.targetWeightKg),
                }),
        }),
    ]
      .filter((s): s is string => !!s)
      .join(', ');

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
        // Only a new user gets the greeting; a known profile is confirmed first, the target and deadline come next turn.
        const ask = REQUIRED_FIELDS.find((k) => m.known[k] === null);
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
        return {
          node: <AgentMessage>{t('chat.limit')}</AgentMessage>,
          replies: [
            {
              text: t('chat.to_form'),
              primary: true,
              act: () => onForm(draft),
            },
            { text: t('chat.continue'), act: () => setDismissed(lastIndex) },
          ],
        };
    }
  }

  const lastIndex = messages.length - 1;
  const lastReplies =
    lastIndex >= 0 && !typing && !failure && dismissed !== lastIndex
      ? render(messages[lastIndex]!, true).replies
      : [];

  // No footer under «How it’s calculated» or the summary (9.4).
  let footer: ReactNode;
  if (how || state === 'summary') footer = null;
  else if (failure === 'ai_down')
    footer = (
      <>
        <Banner title={t('chat.ai_down')}>{t('chat.ai_down_body')}</Banner>
        <Button onClick={() => onForm(draft)}>{t('chat.fill_form')}</Button>
      </>
    );
  else if (failure === 'closed')
    footer = (
      <>
        <Button onClick={() => onForm(draft)}>{t('chat.to_form')}</Button>
        <Button variant="plain" onClick={() => void restart()}>
          {t('chat.restart')}
        </Button>
      </>
    );
  else
    footer = (
      <Composer
        value={text}
        onChange={setText}
        onSend={(body) => void turn(body)}
        disabledText={
          !online
            ? t('chat.offline_disabled')
            : state === 'minor'
              ? t('chat.minor_disabled')
              : undefined
        }
      />
    );

  return (
    <>
      <Sheet
        open={open}
        full
        title={t('chat.title')}
        onClose={onClose}
        action={{
          label: t('chat.more'),
          icon: Ellipsis,
          onClick: () => setMenu(true),
        }}
        footer={footer}
      >
        {!online && <OfflineBar variant="chat" />}
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
                  else void turn(reply);
                }}
              />
            )}
            {typing && <TypingIndicator />}
            {failure === 'retry' && online && (
              <Banner
                tone="danger"
                title={t('chat.retry_error')}
                actions={
                  <Button small onClick={() => void turn(null)}>
                    {t('common.retry')}
                  </Button>
                }
              />
            )}
            <div ref={endRef} />
          </ChatFeed>
        )}
      </Sheet>
      <Sheet
        open={menu}
        title={t('chat.more')}
        onClose={() => setMenu(false)}
        footer={
          <>
            <Button
              variant="tonal"
              onClick={() => {
                setMenu(false);
                onForm(draft);
              }}
            >
              {t('chat.to_form')}
            </Button>
            <Button variant="danger-plain" onClick={() => void restart()}>
              {t('chat.restart')}
            </Button>
            <Button variant="plain" onClick={() => setMenu(false)}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        {/* 9.13: the note is the confirmation, no second dialog. */}
        <p>{t('chat.restart_note')}</p>
      </Sheet>
      <ConfirmDialog
        open={confirm}
        tone="primary"
        title={t('chat.replace.title', {
          n: new Intl.NumberFormat(locale).format(lastSummary?.norm.kcal ?? 0),
        })}
        body={t('chat.replace.body', {
          m: new Intl.NumberFormat(locale).format(manualKcal ?? 0),
        })}
        confirmLabel={t('chat.replace.confirm')}
        onConfirm={() => void apply()}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
