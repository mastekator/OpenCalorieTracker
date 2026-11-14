import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  ConfigResponse,
  InviteCheckResponse,
  MeResponse,
} from '@oct/shared';
import { AuthLayout } from './AuthLayout';
import { RegisterScreen } from './RegisterScreen';

const config: ConfigResponse = {
  version: '0.1.0',
  apiVersion: 1,
  publicUrl: 'https://food.example.com',
  authMethods: ['passkey', 'password'],
  registration: 'invite',
  setupError: null,
};
const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1';
const TELEGRAM = 'Mozilla/5.0 (iPhone) Mobile/15E148 Telegram-iOS';
const valid: InviteCheckResponse = {
  kind: 'invite',
  email: 'anna@example.com',
  status: 'valid',
};
const oleg: MeResponse = {
  id: 2,
  email: 'oleg@example.com',
  name: 'Oleg',
  role: 'user',
  locale: 'en',
  theme: 'system',
  units: 'metric',
  normDisclaimerHidden: false,
  passwordFromConfig: false,
  methods: ['password'],
  enabledMethods: ['password'],
};

type Args = Parameters<typeof RegisterScreen>[0] & {
  /** What POST /api/auth/invites/check answers in this story. */
  check?: InviteCheckResponse;
};

/** Invite, recovery and new account, OCT-13 §6 (mockups 2.1–2.7). Theme and language: toolbar. */
const meta = {
  title: 'App/RegisterScreen',
  component: RegisterScreen,
  render: (args) => (
    <AuthLayout>
      <RegisterScreen {...args} />
    </AuthLayout>
  ),
  // The link check is the only request before a submit; answer it from the story.
  beforeEach: ({ args }) => {
    const original = window.fetch;
    window.fetch = async () => Response.json(args.check ?? valid);
    return () => {
      window.fetch = original;
    };
  },
  args: {
    kind: 'invite',
    config,
    token: 'story',
    user: null,
    userAgent: SAFARI,
    href: 'https://food.example.com/invite#story',
    onSignedIn: async () => {},
    onSignOut: async () => {},
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

const desktop = { viewport: { value: 'desktop' } };

/** 2.1 Invite: passkey by default. */
export const Invite: Story = {};
export const InviteDark: Story = { globals: { theme: 'dark' } };
export const InviteDesktop: Story = { globals: desktop };
/** 2.2 Password only: rules and repeat. */
export const InvitePassword: Story = {
  args: { config: { ...config, authMethods: ['password'] } },
};
export const InvitePasswordDark: Story = {
  ...InvitePassword,
  globals: { theme: 'dark' },
};
/** 2.3 A messenger’s built-in browser: banner, copy, password selected. */
export const InAppBrowser: Story = { args: { userAgent: TELEGRAM } };
export const InAppBrowserDark: Story = {
  ...InAppBrowser,
  globals: { theme: 'dark' },
};
/** 2.3 on Android: no browser named in the title. */
export const InAppBrowserAndroid: Story = {
  args: { userAgent: 'Mozilla/5.0 (Linux; Android 14; wv) Telegram-Android' },
};
/** 2.3 with password sign-in off: only the banner and the copy button. */
export const InAppBrowserPasskeyOnly: Story = {
  args: {
    userAgent: TELEGRAM,
    config: { ...config, authMethods: ['passkey'] },
  },
};
/** 2.4 Invalid link, one per reason. */
export const LinkExpired: Story = {
  args: { check: { kind: 'invite', email: null, status: 'expired' } },
};
export const LinkExpiredDark: Story = {
  ...LinkExpired,
  globals: { theme: 'dark' },
};
export const LinkUsed: Story = {
  args: { check: { kind: 'invite', email: null, status: 'used' } },
};
export const LinkInvalid: Story = {
  args: { check: { kind: null, email: null, status: 'invalid' } },
};
export const RecoveryLinkExpired: Story = {
  args: {
    kind: 'recovery',
    check: { kind: 'recovery', email: null, status: 'expired' },
  },
};
/** 2.5 Someone is already signed in on this device. */
export const SignedIn: Story = { args: { user: oleg } };
export const SignedInDark: Story = {
  ...SignedIn,
  globals: { theme: 'dark' },
};
/** 2.6 Recovery: no name, «New passkey | New password». */
export const Recovery: Story = {
  args: { kind: 'recovery', check: { ...valid, kind: 'recovery' } },
};
export const RecoveryDark: Story = {
  ...Recovery,
  globals: { theme: 'dark' },
};
/** 2.7 Open registration: the email is typed. */
export const OpenRegistration: Story = {
  args: { kind: 'open', token: undefined },
};
export const OpenRegistrationDark: Story = {
  ...OpenRegistration,
  globals: { theme: 'dark' },
};
export const OpenRegistrationDesktop: Story = {
  ...OpenRegistration,
  globals: desktop,
};
