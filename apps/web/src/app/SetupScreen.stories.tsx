import type { Meta, StoryObj } from '@storybook/react-vite';
import { fireEvent, within } from 'storybook/test';
import type { AdminAiStatus, ConfigResponse } from '@oct/shared';
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
  /** What GET /api/admin/ai answers at step 3; none — a 500. */
  ai?: AdminAiStatus;
};

const ai = (over: Partial<AdminAiStatus>): AdminAiStatus => ({
  provider: 'google',
  providerName: 'Google',
  model: 'gemini-3.8-flash',
  keySet: true,
  baseUrlHost: null,
  source: 'env',
  keyLast4: null,
  keyUnreadable: false,
  savedInactive: false,
  rev: null,
  allowUserKeys: true,
  userKeysLocked: false,
  refineLimit: null,
  testPhotoCount: 9,
  state: 'ok',
  checkedAt: null,
  ...over,
});
const AI_OFF = ai({
  provider: null,
  providerName: null,
  model: null,
  keySet: false,
  source: null,
  state: 'not_configured',
});

/** First-run wizard (OCT-244 mockups 1.1–3.2). Theme and language: toolbar; Dark and Desktop below. */
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
    window.fetch = async (input) =>
      String(input).endsWith('/api/admin/ai')
        ? args.ai
          ? Response.json(args.ai)
          : Response.json({ error: { code: 'internal' } }, { status: 500 })
        : args.answer === 'pending'
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
  args: { config, origin: ORIGIN, onSignedIn: async () => {} },
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
/** A right code opens step 2. */
export const Accepted: Story = { play: submit('K7QM3XRP') };
export const DesktopDone: Story = {
  args: { end: 'done' },
  globals: desktop,
};

/** 2.1 Both methods: passkey first. */
export const Admin: Story = { args: { step: 2 } };
export const AdminDark: Story = {
  args: { step: 2 },
  globals: { theme: 'dark' },
};
export const AdminDesktop: Story = { args: { step: 2 }, globals: desktop };
export const AdminDesktopDark: Story = {
  args: { step: 2 },
  globals: { ...desktop, theme: 'dark' },
};
/** 2.2 Password with errors shown on submit. */
export const AdminPasswordErrors: Story = {
  args: { step: 2, config: { ...config, authMethods: ['password'] } },
  play: async ({ canvasElement }) => {
    fireEvent.submit(canvasElement.querySelector('form')!);
  },
};
/** 2.3 Password only: no segment. */
export const AdminPasswordOnly: Story = {
  args: { step: 2, config: { ...config, authMethods: ['password'] } },
};
/** 2.4 Passkey only. */
export const AdminPasskeyOnly: Story = {
  args: { step: 2, config: { ...config, authMethods: ['passkey'] } },
};
/** 2.6 The passkey dialog was closed: a neutral line, not an error. */
export const AdminPasskeyCancel: Story = {
  args: { step: 2, passkeyNotice: 'cancel' },
};
/** 2.7 The passkey failed: no account, the code still works. */
export const AdminPasskeyFailed: Story = {
  args: { step: 2, passkeyNotice: 'failed' },
};
export const AdminPasskeyFailedDark: Story = {
  args: { step: 2, passkeyNotice: 'failed' },
  globals: { theme: 'dark' },
};
/** 2.8 Both methods, not at PUBLIC_URL: password first, the reason above the fields. */
export const AdminAway: Story = {
  args: { step: 2, origin: 'http://192.168.1.5:3000' },
};
export const AdminAwayDark: Story = {
  args: { step: 2, origin: 'http://192.168.1.5:3000' },
  globals: { theme: 'dark' },
};

/** 3.1 All set, AI not configured: «Set up AI». */
export const Ready: Story = { args: { step: 3, ai: AI_OFF } };
export const ReadyDark: Story = {
  args: { step: 3, ai: AI_OFF },
  globals: { theme: 'dark' },
};
/** 3.2 AI configured and working: provider and model, no button. */
export const ReadyAi: Story = { args: { step: 3, ai: ai({}) } };
export const ReadyAiDark: Story = {
  args: { step: 3, ai: ai({}) },
  globals: { theme: 'dark' },
};
/** 3.2 The provider check failed: its state and «Set up AI». */
export const ReadyAiFailing: Story = {
  args: { step: 3, ai: ai({ state: 'unavailable' }) },
};
/** The AI status didn't come: «Set up AI» anyway. */
export const ReadyNoStatus: Story = { args: { step: 3 } };
export const ReadyDesktop: Story = {
  args: { step: 3, ai: ai({}) },
  globals: desktop,
};
export const ReadyDesktopDark: Story = {
  args: { step: 3, ai: AI_OFF },
  globals: { ...desktop, theme: 'dark' },
};
