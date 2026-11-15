import type { Meta, StoryObj } from '@storybook/react-vite';
import type { MeResponse, Passkey } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { atPath } from '../../ui/navStory';
import { ToastProvider } from '../../ui/Toast/Toast';
import { AiProviderScreen } from './AiProviderScreen';
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

/** Answers GET /api/account/passkeys with `list`, /api/admin/ai with a quota state, /api/ai/status with Gemini; anything else succeeds empty. */
const serve = (list: Passkey[]) => () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/account/passkeys')
      ? Response.json(list)
      : String(input).endsWith('/api/ai/status')
        ? Response.json({
            recognition: 'ready',
            interview: 'ready',
            providerName: 'Google Gemini',
            baseUrlHost: null,
          })
        : String(input).endsWith('/api/admin/ai')
          ? Response.json({
              provider: 'google',
              providerName: 'Google Gemini',
              model: 'gemini-2.5-flash',
              keySet: true,
              baseUrlHost: null,
              source: 'env',
              state: 'quota_exceeded',
              checkedAt: Date.now(),
            })
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

const settings = (u: MeResponse, platform: 'safari' | null = null) => (
  <DataProvider user={u}>
    <SettingsScreen user={u} onLogout={async () => {}} platform={platform} />
  </DataProvider>
);
/** Forces navigator.onLine off; the real screen follows the browser's online/offline events. */
const offline = () => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => false,
  });
  return () => void delete (navigator as { onLine?: boolean }).onLine;
};
/** 4.1: language, theme and units segments; recognition with the provider. */
export const User: Story = {
  beforeEach: serve([]),
  render: () => settings(user),
};
export const UserDark: Story = { ...User, ...dark };
/** iPhone in Safari, not installed: the «Add to Home Screen» row opens the steps sheet. */
export const UserInstall: Story = {
  beforeEach: serve([]),
  render: () => settings(user, 'safari'),
};
export const UserInstallDark: Story = { ...UserInstall, ...dark };
/** D.1: the same groups in two columns. */
export const Desktop: Story = {
  beforeEach: () => {
    localStorage.setItem(hintClosedKey(admin.id), '1');
    return serve([])();
  },
  render: () => settings(admin),
  globals: { viewport: { value: 'desktop' } },
};
export const DesktopDark: Story = {
  ...Desktop,
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
/** Admin with the AC-1.7 hint and the AI provider badge. */
export const Admin: Story = {
  beforeEach: () => {
    localStorage.removeItem(hintClosedKey(admin.id));
    return serve([])();
  },
  render: () => settings(admin),
};
export const AdminDark: Story = { ...Admin, ...dark };
/** 4.8 Offline: the banner; admin, passkey and password rows greyed out, a tap shows the reason (3.6). */
export const AdminOffline: Story = {
  beforeEach: () => {
    localStorage.setItem(hintClosedKey(admin.id), '1');
    return offline();
  },
  render: () => settings(admin),
};
export const AdminOfflineDark: Story = { ...AdminOffline, ...dark };
/** OCT-25 5.6: the AI provider screen offline shows no stale status. */
export const AiProviderOffline: Story = {
  beforeEach: offline,
  render: () => <AiProviderScreen />,
};
export const AiProviderOfflineDark: Story = { ...AiProviderOffline, ...dark };
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
