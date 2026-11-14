import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pencil } from 'lucide-react';
import { calculateNorm, type Profile } from '@oct/shared';
import { useT } from '../../i18n';
import { Sheet } from '../Sheet/Sheet';
import {
  AgentMessage,
  ChatFeed,
  ChatNote,
  Composer,
  NormSummary,
  QuickReplies,
  TypingIndicator,
  UserMessage,
} from './AgentChat';

type State =
  | 'start'
  | 'several'
  | 'pace'
  | 'summary'
  | 'filled'
  | 'units'
  | 'minor'
  | 'apply_failed';

type Props = { state: State; units?: 'metric' | 'us'; applying?: boolean };

const noop = () => {};
const TODAY = '2026-11-13';
const draft: Profile = {
  sex: 'male',
  birthDate: '1992-05-02',
  heightCm: 182,
  weightKg: 85,
  activity: 'moderate',
  goal: 'lose',
  targetWeightKg: 75,
  deadline: '2027-02-05',
};
const norm = calculateNorm(draft, TODAY);

// Model replies are free text from the AI; samples in both languages (OCT-22 prototype).
const SAMPLE = {
  en: {
    q_sex: 'Which formula should I use — male or female?',
    answer: 'male, 34, 182 and 85',
    noted:
      'Noted: male formula, 34, 182 cm, 85 kg.\nWhat’s a typical day like — mostly sitting or on the move? How often do you work out?',
    day: 'office job, but gym about 4 times',
    goal: 'Sounds like “Moderate” activity. What’s your goal — lose, maintain or gain?',
    goal_answer: 'lose to 75 by new year',
    pace: 'By December 31 that’s ≈ 1.4 kg a week — more than 1.5% of body weight. This pace may harm your health.\nA safe pace gets you there by February 5. Which date should I use?',
    pace_replies: ['By February 5', 'Keep December 31'],
    done: 'Done, I have everything.',
    known:
      'I have: male formula, 30, 180 cm, 80 kg, moderate activity, goal — maintain.\nHas anything changed?',
    known_replies: ['All correct', 'My weight changed', 'Different goal'],
    weight_q: 'How much do you weigh?',
    weight_a: 'about 180',
    units: 'Is 180 in pounds? That’s about 81.6 kg.',
    units_replies: ['Yes, pounds', 'No, kilograms'],
    age_q: 'How old are you?',
    minor:
      'This calculation is for adults. For teenagers, it’s best to set a goal with a doctor — you can enter one manually.',
    manual: 'Set my own goal',
  },
  ru: {
    q_sex: 'По какой формуле считать — мужской или женской?',
    answer: 'мужчина, 34, 182 и 85',
    noted:
      'Записал: мужская формула, 34 года, 182 см, 85 кг.\nКак обычно проходит ваш день — больше сидя или в движении? Сколько раз в неделю тренируетесь?',
    day: 'сижу в офисе, но в зал хожу раза 4',
    goal: 'Похоже на «Среднюю» активность. Какая цель — похудеть, держать вес или набрать?',
    goal_answer: 'похудеть до 75 к новому году',
    pace: 'До 31 декабря это ≈ 1,4 кг в неделю — больше 1,5 % веса. Такой темп может навредить здоровью.\nБезопасный темп — к 5 февраля. Какой срок поставить?',
    pace_replies: ['К 5 февраля', 'Оставить 31 декабря'],
    done: 'Готово, всё собрал.',
    known:
      'У меня записано: мужская формула, 30 лет, 180 см, 80 кг, средняя активность, цель — держать вес.\nЧто-нибудь изменилось?',
    known_replies: ['Всё верно', 'Изменился вес', 'Другая цель'],
    weight_q: 'Сколько вы весите?',
    weight_a: 'вешу 180',
    units: '180 — это фунты? В килограммах это около 81,6.',
    units_replies: ['Да, фунты', 'Нет, килограммы'],
    age_q: 'Сколько вам лет?',
    minor:
      'Расчёт рассчитан на взрослых. Для подростков норму лучше определить с врачом — её можно задать вручную.',
    manual: 'Задать норму вручную',
  },
};

/** The chat as the container (OCT-90) will lay it out: a full-height sheet, the feed, the composer in the footer. */
function Chat({ state, units = 'metric', applying = false }: Props) {
  const { t, locale } = useT();
  const s = SAMPLE[locale === 'ru' ? 'ru' : 'en'];
  const [value, setValue] = useState('');
  const replies = (texts: string[]) => (
    <QuickReplies replies={texts.map((text) => ({ text }))} onPick={noop} />
  );
  const greeting = <AgentMessage>{t('chat.greeting')}</AgentMessage>;
  const note = <ChatNote>{t('norm.disclaimer')}</ChatNote>;
  const summary = norm.status === 'ok' && (
    <NormSummary
      draft={draft}
      norm={norm}
      units={units}
      disclaimer
      applying={applying}
      failed={state === 'apply_failed'}
      onApply={noop}
      onFix={noop}
      onHow={noop}
    />
  );

  const feed: Record<State, ReactNode> = {
    start: (
      <>
        {note}
        <AgentMessage>
          {t('chat.greeting')}
          {'\n'}
          {s.q_sex}
        </AgentMessage>
        {replies([t('field.male'), t('field.female')])}
      </>
    ),
    several: (
      <>
        {note}
        {greeting}
        <UserMessage>{s.answer}</UserMessage>
        <AgentMessage>{s.noted}</AgentMessage>
        <UserMessage>{s.day}</UserMessage>
        <TypingIndicator />
      </>
    ),
    pace: (
      <>
        <AgentMessage>{s.noted}</AgentMessage>
        <UserMessage>{s.day}</UserMessage>
        <AgentMessage>{s.goal}</AgentMessage>
        <UserMessage>{s.goal_answer}</UserMessage>
        <AgentMessage>{s.pace}</AgentMessage>
        {replies(s.pace_replies)}
      </>
    ),
    summary: (
      <>
        <UserMessage>{s.pace_replies[0]!}</UserMessage>
        <AgentMessage>{s.done}</AgentMessage>
        {summary}
      </>
    ),
    apply_failed: (
      <>
        <AgentMessage>{s.done}</AgentMessage>
        {summary}
      </>
    ),
    filled: (
      <>
        {note}
        <AgentMessage>{s.known}</AgentMessage>
        {replies(s.known_replies)}
      </>
    ),
    units: (
      <>
        {greeting}
        <UserMessage>{s.answer}</UserMessage>
        <AgentMessage>{s.weight_q}</AgentMessage>
        <UserMessage>{s.weight_a}</UserMessage>
        <AgentMessage>{s.units}</AgentMessage>
        {replies(s.units_replies)}
      </>
    ),
    minor: (
      <>
        {note}
        <AgentMessage>{s.age_q}</AgentMessage>
        <UserMessage>16</UserMessage>
        <AgentMessage>{s.minor}</AgentMessage>
        <QuickReplies
          replies={[{ text: s.manual, primary: true, icon: Pencil }]}
          onPick={noop}
        />
      </>
    ),
  };

  // The composer hides while the summary is shown (OCT-22 §3).
  const withSummary = state === 'summary' || state === 'apply_failed';
  return (
    <Sheet
      open
      full
      title={t('chat.title')}
      onClose={noop}
      footer={
        !withSummary && (
          <Composer
            value={value}
            onChange={setValue}
            onSend={() => setValue('')}
            disabledText={
              state === 'minor' ? t('chat.minor_disabled') : undefined
            }
          />
        )
      }
    >
      <ChatFeed>{feed[state]}</ChatFeed>
    </Sheet>
  );
}

const meta = {
  title: 'UI/AgentChat',
  component: Chat,
  args: { state: 'start' },
  argTypes: {
    state: {
      control: 'select',
      options: [
        'start',
        'several',
        'pace',
        'summary',
        'filled',
        'units',
        'minor',
        'apply_failed',
      ],
    },
    units: { control: 'inline-radio', options: ['metric', 'us'] },
  },
} satisfies Meta<typeof Chat>;
export default meta;
type Story = StoryObj<typeof meta>;

const dark = { theme: 'dark' } as const;

/** 9.1: empty profile — disclaimer, greeting, first question with capsules. */
export const Start: Story = {};
export const StartDark: Story = { globals: dark };
/** 9.2: several facts at once, the agent is typing. */
export const SeveralAtOnce: Story = { args: { state: 'several' } };
export const SeveralAtOnceDark: Story = {
  args: { state: 'several' },
  globals: dark,
};
/** 9.3: dangerous pace, two equal capsules. */
export const Pace: Story = { args: { state: 'pace' } };
export const PaceDark: Story = { args: { state: 'pace' }, globals: dark };
/** 9.4: summary; the composer is hidden. */
export const Summary: Story = { args: { state: 'summary' } };
export const SummaryDark: Story = {
  args: { state: 'summary' },
  globals: dark,
};
export const SummaryUs: Story = { args: { state: 'summary', units: 'us' } };
export const SummaryApplying: Story = {
  args: { state: 'summary', applying: true },
};
/** 9.5 is the confirm dialog of the container (OCT-90); 9.6: the profile is already filled. */
export const Filled: Story = { args: { state: 'filled' } };
export const FilledDark: Story = { args: { state: 'filled' }, globals: dark };
/** 9.7: unclear units. */
export const Units: Story = { args: { state: 'units' } };
export const UnitsDark: Story = { args: { state: 'units' }, globals: dark };
/** 9.8: under 18 — action capsule, composer disabled with its reason. */
export const Minor: Story = { args: { state: 'minor' } };
export const MinorDark: Story = { args: { state: 'minor' }, globals: dark };
/** 9.14: applying failed — danger banner, «Try again». */
export const ApplyFailed: Story = { args: { state: 'apply_failed' } };
export const ApplyFailedDark: Story = {
  args: { state: 'apply_failed' },
  globals: dark,
};
export const Russian: Story = {
  args: { state: 'pace' },
  globals: { locale: 'ru' },
};
/** D.2: centred dialog, 88 % high. */
export const Desktop: Story = {
  args: { state: 'pace' },
  globals: { viewport: { value: 'desktop' } },
};
export const DesktopSummaryDark: Story = {
  args: { state: 'summary' },
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
