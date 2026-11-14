import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ConfigResponse } from '@oct/shared';
import { AuthLayout } from './AuthLayout';
import { LoginScreen } from './LoginScreen';

const ORIGIN = 'https://food.example.com';
const config: ConfigResponse = {
  version: '0.1.0',
  apiVersion: 1,
  publicUrl: ORIGIN,
  authMethods: ['passkey', 'password'],
  registration: 'invite',
  setupError: null,
};

/** Sign-in, OCT-13 §5 (mockups 1.1–1.9). Theme and language: toolbar; Dark and Desktop stories below. */
const meta = {
  title: 'App/LoginScreen',
  component: LoginScreen,
  render: (args) => (
    <AuthLayout>
      <LoginScreen {...args} />
    </AuthLayout>
  ),
  args: { config, origin: ORIGIN, onSignedIn: async () => {} },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LoginScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

const desktop = { viewport: { value: 'desktop' } };
const withConfig = (patch: Partial<ConfigResponse>) => ({
  config: { ...config, ...patch },
});

/** 1.1 Passkey and password (the default). */
export const Default: Story = {};
export const Dark: Story = { globals: { theme: 'dark' } };
export const Desktop: Story = { globals: desktop };
export const DesktopDark: Story = { globals: { ...desktop, theme: 'dark' } };
/** 1.6 Password only. */
export const PasswordOnly: Story = {
  args: withConfig({ authMethods: ['password'] }),
};
/** 1.5 Passkey only: the button at the bottom, «Lost access?». */
export const PasskeyOnly: Story = {
  args: withConfig({ authMethods: ['passkey'] }),
};
export const OpenRegistration: Story = {
  args: withConfig({ registration: 'open' }),
};
/** 1.6 Back after the session expired. */
export const SessionExpired: Story = { args: { notice: { kind: 'expired' } } };
/** 1.2 Wrong email or password. */
export const WrongPassword: Story = {
  args: { notice: { kind: 'error', code: 'invalid_credentials' } },
};
/** 1.3 Too many attempts: fields locked, passkey still works. */
export const Timeout: Story = {
  args: { notice: { kind: 'timeout', until: Date.now() + 14 * 60_000 } },
};
/** 1.4 Device or network blocked: password form hidden. */
export const Blocked: Story = { args: { notice: { kind: 'blocked' } } };
/** 1.5 The browser has no WebAuthn. */
export const NoPasskey: Story = { args: { notice: { kind: 'no_passkey' } } };
export const NoPasskeyPasskeyOnly: Story = {
  args: {
    ...withConfig({ authMethods: ['passkey'] }),
    notice: { kind: 'no_passkey' },
  },
};
/** 1.5 The server doesn't know this passkey any more. */
export const PasskeyRevoked: Story = { args: { notice: { kind: 'revoked' } } };
/** 1.8 Opened at another address than PUBLIC_URL. */
export const WrongOrigin: Story = {
  args: { origin: 'http://192.168.1.5:3000' },
};
export const WrongOriginDark: Story = {
  args: { origin: 'http://192.168.1.5:3000' },
  globals: { theme: 'dark' },
};
/** 1.8 Installation isn't set up. */
export const SetupError: Story = {
  args: withConfig({ setupError: 'admin_missing' }),
};
/** 1.9 Offline: bar on top, buttons disabled, fields usable. */
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
