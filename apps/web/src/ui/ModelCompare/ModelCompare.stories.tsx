import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { AiTestRunSummary } from '@oct/shared';
import { TEST_PHOTOS } from '../TestPhotoList/fixtures';
import { ModelCompare } from './ModelCompare';

const at = (day: number) => Date.UTC(2026, 10, day);
const run = (
  id: number,
  patch: Partial<AiTestRunSummary>,
): AiTestRunSummary => ({
  id,
  provider: 'google',
  model: 'gemini-3.5-flash-lite',
  status: 'done',
  stopReason: null,
  appVersion: '0.2.0',
  promptVersion: 3,
  testSet: 2,
  currentSet: 2,
  startedAt: at(18),
  finishedAt: at(18),
  inputTokens: 12000,
  outputTokens: 1200,
  costUsd: null,
  passed: 8,
  total: 9,
  msPerPhoto: 3800,
  ...patch,
});

/** OCT-248 6.2: tokens, cost, the best, a local model, a stopped and an interrupted run. */
const RUNS: AiTestRunSummary[] = [
  run(6, {}),
  run(5, {
    provider: 'openrouter',
    model: 'qwen/qwen3-vl-235b-a22b-instruct',
    passed: 7,
    msPerPhoto: 6100,
    costUsd: 0.011,
  }),
  run(4, {
    provider: 'openrouter',
    model: 'google/gemini-3.8-flash',
    passed: 9,
    msPerPhoto: 4900,
    costUsd: 0.006,
    startedAt: at(17),
  }),
  run(3, {
    provider: 'openai-compatible',
    model: 'llava-next:13b',
    passed: 4,
    msPerPhoto: 21400,
    inputTokens: 10000,
    outputTokens: 1800,
    startedAt: at(17),
  }),
  run(2, {
    model: 'gemini-3.8-pro',
    status: 'stopped',
    stopReason: 'auth_error',
    passed: 0,
    msPerPhoto: null,
    inputTokens: null,
    outputTokens: null,
    startedAt: at(16),
  }),
  run(1, {
    model: 'gemini-3.5-flash',
    status: 'interrupted',
    passed: 3,
    msPerPhoto: 3200,
    startedAt: at(16),
  }),
];
const opened = {
  ...RUNS[0]!,
  photos: TEST_PHOTOS,
  modelsMdRow: '|',
  report: '|',
};

/** «Model comparison» on «AI provider», OCT-248 4.6 and 6.2. No runs, no block, so no story. */
const meta = {
  title: 'UI/ModelCompare',
  component: ModelCompare,
  args: {
    runs: RUNS,
    openId: null,
    openRun: null,
    onToggle: fn(),
    onCopy: fn(),
    onDelete: fn(),
    onClear: fn(),
  },
} satisfies Meta<typeof ModelCompare>;
export default meta;
type Story = StoryObj<typeof meta>;
const desktop = { viewport: { value: 'desktop' } };

/** 4.6 Phone: a card per run; a tap opens its photos. */
export const Several: Story = {};
export const SeveralDark: Story = { globals: { theme: 'dark' } };
/** 6.2 Desktop: a table, the best row tinted; a click anywhere on a row opens it (OCT-300). */
export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, theme: 'dark' } };
/** One complete run: it is the best; a stopped one never is. */
export const OneBest: Story = { args: { runs: [RUNS[0]!, RUNS[4]!] } };
export const OneBestDark: Story = { ...OneBest, globals: { theme: 'dark' } };
/** Stopped and interrupted only: no best, no copy. */
export const StoppedInterrupted: Story = {
  args: { runs: RUNS.slice(4) },
  globals: desktop,
};
export const StoppedInterruptedDark: Story = {
  ...StoppedInterrupted,
  globals: { ...desktop, theme: 'dark' },
};
/** A row opened: copy and delete buttons, then the photos with the dishes the model returned (6.2, OCT-300). */
export const Opened: Story = { args: { openId: 6, openRun: opened } };
export const OpenedDark: Story = { ...Opened, globals: { theme: 'dark' } };
export const OpenedDesktop: Story = { ...Opened, globals: desktop };
export const OpenedDesktopDark: Story = {
  ...Opened,
  globals: { ...desktop, theme: 'dark' },
};
/** The photos are on their way. */
export const Loading: Story = { args: { openId: 6, openRun: null } };
export const LoadingDark: Story = { ...Loading, globals: { theme: 'dark' } };
