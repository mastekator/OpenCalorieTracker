import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, within } from 'storybook/test';
import type { ConfigResponse } from '@oct/shared';
import { AuthLayout } from './AuthLayout';
import { SetupScreen } from './SetupScreen';

const ORIGIN = 'https://food.example.com';
const config: ConfigResponse = {
  version: '0.2.0',
  apiVersion: 1,
  publicUrl: ORIGIN,
  authMethods: ['passkey', 'password'],
  registration: 'invite',
  setupError: null,
  setupRequired: true,
};

type Args = Parameters<typeof SetupScreen>[0] & {
  /** How POST /api/setup/code answers: an error code, `pending` (never), or 204. */
  answer?: { code: string; status: number } | 'pending';
};

/** First-run wizard, step 1 (OCT-244 mockups 1.1–1.11). Theme and language: toolbar; Dark and Desktop below. */
const meta = {
  title: 'App/SetupScreen',
  component: SetupScreen,
  render: (args) => (
    <AuthLayout>
      <SetupScreen {...args} />
    </AuthLayout>
  ),
  beforeEach: ({ args }) => {
    const original = window.fetch;
    window.fetch = async () =>
      args.answer === 'pending'
        ? new Promise<Response>(() => {})
        : args.answer
          ? Response.json(
              { error: { code: args.answer.code } },
              { status: args.answer.status },
            )
          : new Response(null, { status: 204 });
    return () => {
      window.fetch = original;
    };
  },
  args: { config, origin: ORIGIN },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

const desktop = { viewport: { value: 'desktop' } };

/** Types a code and presses «Continue». */
const submit =
  (code: string): Story['play'] =>
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    fireEvent.change(await canvas.findByRole('textbox'), {
      target: { value: code },
    });
    fireEvent.submit(canvasElement.querySelector('form')!);
  };

/** 1.1 Opened: anyone sees only the code step. */
export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
/** 1.2 «Where's the log?» opened. */
export const Help: Story = { args: { helpOpen: true } };
export const HelpDark: Story = {
  args: { helpOpen: true },
  globals: { theme: 'dark' },
};
export const Desktop: Story = { args: { helpOpen: true }, globals: desktop };
export const DesktopDark: Story = {
  args: { helpOpen: true },
  globals: { ...desktop, theme: 'dark' },
};
/** 1.3 Checking: the field locked, «Checking…». */
export const Checking: Story = {
  args: { answer: 'pending' },
  play: submit('K7QM3XRP'),
};
/** 1.4 Wrong code: the error under the field, the code stays. */
export const Invalid: Story = {
  args: { answer: { code: 'setup_code_invalid', status: 400 } },
  play: submit('K7QM3XPR'),
};
export const InvalidDark: Story = {
  ...Invalid,
  globals: { theme: 'dark' },
};
/** 1.4 Fewer than 8 characters: no request. */
export const Short: Story = { play: submit('K7QM3X') };
/** 1.5 Timeout. */
export const Timeout: Story = {
  args: { notice: { kind: 'timeout', until: Date.now() + 14 * 60_000 } },
};
export const TimeoutDark: Story = {
  ...Timeout,
  globals: { theme: 'dark' },
};
/** 1.6 Blocked: the reset-admin-access command instead of the form. */
export const Blocked: Story = { args: { notice: { kind: 'blocked' } } };
export const BlockedDark: Story = {
  args: { notice: { kind: 'blocked' } },
  globals: { theme: 'dark' },
};
/** 1.7 Expired. */
export const Expired: Story = { args: { end: 'expired' } };
export const ExpiredDark: Story = {
  args: { end: 'expired' },
  globals: { theme: 'dark' },
};
/** 1.8 Burned: 5 wrong codes from all addresses. */
export const Burned: Story = { args: { end: 'burned' } };
export const BurnedDark: Story = {
  args: { end: 'burned' },
  globals: { theme: 'dark' },
};
/** 1.9 Already complete (another tab). */
export const Done: Story = { args: { end: 'done' } };
export const DoneDark: Story = {
  args: { end: 'done' },
  globals: { theme: 'dark' },
};
/** 1.10 Passkey only, opened not at PUBLIC_URL. */
export const WrongOrigin: Story = {
  args: {
    config: { ...config, authMethods: ['passkey'] },
    origin: 'http://192.168.1.5:3000',
  },
};
export const WrongOriginDark: Story = {
  ...WrongOrigin,
  globals: { theme: 'dark' },
};
/** 1.11 Offline: the bar on top, the field usable, the button off. */
export const Offline: Story = {
  beforeEach: () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
    return () => {
      delete (navigator as { onLine?: boolean }).onLine;
    };
  },
};
/** Step 2 placeholder after a right code (the form comes with OCT-286). */
export const Accepted: Story = { play: submit('K7QM3XRP') };
export const DesktopDone: Story = {
  args: { end: 'done' },
  globals: desktop,
};
