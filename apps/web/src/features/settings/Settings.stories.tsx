import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MeResponse, Passkey } from '@oct/shared';
import { atPath } from '../../ui/navStory';
import { ToastProvider } from '../../ui/Toast/Toast';
import { PasskeySheet, PasskeysScreen } from './PasskeysScreen';
import { PasswordScreen } from './PasswordScreen';
import { hintClosedKey, SettingsScreen } from './SettingsScreen';

const user: MeResponse = {
  id: 2,
  email: 'anna@example.com',
  name: 'Anna',
  role: 'user',
  locale: 'en',
  theme: 'system',
  units: 'metric',
  normDisclaimerHidden: false,
  passwordFromConfig: false,
  methods: ['password', 'passkey'],
  enabledMethods: ['password', 'passkey'],
};
const admin: MeResponse = {
  ...user,
  id: 1,
  role: 'admin',
  passwordFromConfig: true,
};
const passkeys: Passkey[] = [
  {
    id: 1,
    name: 'iPhone · Safari',
    createdAt: Date.UTC(2026, 9, 2),
    lastUsedAt: Date.UTC(2026, 10, 13),
    thisDevice: true,
  },
  {
    id: 2,
    name: 'Mac · Chrome',
    createdAt: Date.UTC(2026, 10, 1),
    lastUsedAt: null,
    thisDevice: false,
  },
];

/** Answers GET /api/account/passkeys with `list`; anything else succeeds empty. */
const serve = (list: Passkey[]) => () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/account/passkeys')
      ? Response.json(list)
      : new Response(null, { status: 204 });
  return () => {
    globalThis.fetch = real;
  };
};

/** Settings, OCT-13 §7 (screen 10, 3.3–3.5). Theme and language: toolbar; Dark stories below. */
const meta = {
  title: 'Settings/Screens',
  decorators: [
    atPath,
    (Story) => (
      <ToastProvider>
        <div className="screen__body">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

const settings = (u: MeResponse) => (
  <SettingsScreen user={u} onLogout={() => {}} />
);
/** Forces navigator.onLine off; the real screen follows the browser's online/offline events. */
const offline = () => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => false,
  });
  return () => void delete (navigator as { onLine?: boolean }).onLine;
};
export const User: Story = { render: () => settings(user) };
export const UserDark: Story = { ...User, ...dark };
/** Admin with the AC-1.7 hint. */
export const Admin: Story = {
  beforeEach: () => localStorage.removeItem(hintClosedKey(admin.id)),
  render: () => settings(admin),
};
export const AdminDark: Story = { ...Admin, ...dark };
/** 4.8 Offline: admin, passkey and password rows greyed out, a tap shows the reason (3.6). */
export const AdminOffline: Story = {
  beforeEach: () => {
    localStorage.setItem(hintClosedKey(admin.id), '1');
    return offline();
  },
  render: () => settings(admin),
};
export const AdminOfflineDark: Story = { ...AdminOffline, ...dark };
/** Passkey-only server: no password row. */
export const PasskeyOnly: Story = {
  render: () => settings({ ...user, enabledMethods: ['passkey'] }),
};

const changed = async () => {};
/** 3.3 My passkeys. */
export const Passkeys: Story = {
  beforeEach: serve(passkeys),
  render: () => <PasskeysScreen user={user} onChanged={changed} />,
};
export const PasskeysDark: Story = { ...Passkeys, ...dark };
const sheet = (last: boolean) => (
  <PasskeySheet
    passkey={passkeys[0]!}
    last={last}
    onClose={() => {}}
    onDone={changed}
  />
);
export const PasskeySheetStory: Story = {
  name: 'Passkey sheet',
  render: () => sheet(false),
};
export const PasskeySheetDark: Story = {
  ...PasskeySheetStory,
  ...dark,
  name: 'Passkey sheet dark',
};
/** The only way to sign in: delete unavailable, with the reason (AC-6.2). */
export const PasskeySheetLast: Story = {
  name: 'Passkey sheet, last method',
  render: () => sheet(true),
};
export const PasskeySheetLastDark: Story = {
  ...PasskeySheetLast,
  ...dark,
  name: 'Passkey sheet, last method dark',
};

/** 3.4 Change password. */
export const ChangePassword: Story = {
  render: () => <PasswordScreen user={user} onDone={changed} />,
};
export const ChangePasswordDark: Story = { ...ChangePassword, ...dark };
/** 3.4 Set password: no current field. */
export const SetPassword: Story = {
  render: () => (
    <PasswordScreen user={{ ...user, methods: ['passkey'] }} onDone={changed} />
  ),
};
export const SetPasswordDark: Story = { ...SetPassword, ...dark };
