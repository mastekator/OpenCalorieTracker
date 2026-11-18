import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { AiTestRun } from '@oct/shared';
import {
  RUNNING_PHOTOS,
  STOPPED_PHOTOS,
  TEST_PHOTOS,
} from '../TestPhotoList/fixtures';
import { ModelTestCard } from './ModelTestCard';

const ROW =
  '| google | gemini-3.5-flash-lite | 5/6 | 2026-11-18 | 3.5 s/photo; OCT v0.2.0, prompt 3 |';
const done: AiTestRun = {
  id: 1,
  provider: 'google',
  model: 'gemini-3.5-flash-lite',
  status: 'done',
  stopReason: null,
  appVersion: '0.2.0',
  promptVersion: 3,
  startedAt: Date.UTC(2026, 10, 18),
  finishedAt: Date.UTC(2026, 10, 18),
  inputTokens: 12000,
  outputTokens: 1200,
  costUsd: null,
  passed: 4,
  total: 6,
  msPerPhoto: 3500,
  photos: TEST_PHOTOS,
  modelsMdRow: ROW,
  report: ROW,
};

/** «Model test» block on «AI provider», OCT-248 §4. */
const meta = {
  title: 'UI/ModelTestCard',
  component: ModelTestCard,
  args: {
    run: null,
    target: 'Google · gemini-3.5-flash-lite',
    onStart: fn(),
    onStop: fn(),
    onCopy: fn(),
  },
  decorators: [(Story) => <div style={{ maxWidth: 400 }}>{Story()}</div>],
} satisfies Meta<typeof ModelTestCard>;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** Before the first run: what will be tested and the button. */
export const Idle: Story = {};
export const IdleDark: Story = { ...dark };
/** The form changed: the draft is tested as it is. */
export const Unsaved: Story = { args: { targetNote: 'not saved' } };
export const UnsavedDark: Story = { ...Unsaved, ...dark };
/** 3.3 Settings from .env: the target row opens «Another model for the test». */
export const Env: Story = {
  args: { targetNote: 'current, from .env', onTarget: fn() },
};
export const EnvDark: Story = { ...Env, ...dark };
/** 4.2 Photo 4 of 6 with «Stop». */
export const Running: Story = {
  args: {
    run: {
      ...done,
      status: 'running',
      finishedAt: null,
      photos: RUNNING_PHOTOS,
    },
  },
};
export const RunningDark: Story = { ...Running, ...dark };
/** 4.3 Result with both copy buttons. */
export const Done: Story = { args: { run: done } };
export const DoneDark: Story = { ...Done, ...dark };
/** OpenRouter: the cost instead of a dash. */
export const WithCost: Story = {
  args: { run: { ...done, provider: 'openrouter', costUsd: 0.011 } },
};
export const WithCostDark: Story = { ...WithCost, ...dark };
/** 4.5 Stopped by a bad key: no copy buttons. */
export const Stopped: Story = {
  args: {
    run: {
      ...done,
      status: 'stopped',
      stopReason: 'auth_error',
      passed: 0,
      photos: STOPPED_PHOTOS,
      modelsMdRow: undefined,
      report: undefined,
    },
  },
};
export const StoppedDark: Story = { ...Stopped, ...dark };
/** 4.6 Interrupted by a restart: «Run again». */
export const Interrupted: Story = {
  args: {
    run: {
      ...done,
      status: 'interrupted',
      modelsMdRow: undefined,
      report: undefined,
    },
  },
};
export const InterruptedDark: Story = { ...Interrupted, ...dark };
/** The start request is on its way. */
export const Starting: Story = { args: { starting: true } };
export const StartingDark: Story = { ...Starting, ...dark };
