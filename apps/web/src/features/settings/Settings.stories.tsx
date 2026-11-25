import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import type { AiStatus, MeResponse, Passkey } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { openUserDb } from '../../data/db';
import { atPath } from '../../ui/navStory';
import { ToastProvider } from '../../ui/Toast/Toast';
import { AdminIntegrationsScreen } from '../admin/AdminIntegrationsScreen';
import { AiProviderScreen } from './AiProviderScreen';
import { McpScreen } from './McpScreen';
import {
  BarcodeIntegrationScreen,
  IntegrationsScreen,
} from './IntegrationsScreen';
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

const geminiStatus: AiStatus = {
  recognition: 'ready',
  interview: 'ready',
  providerName: 'Google Gemini',
  baseUrlHost: null,
  refineLimit: null,
};

/** Answers GET /api/account/passkeys with `list`, /api/admin/ai with a quota state, /api/ai/status with Gemini; anything else succeeds empty. */
const serve = (list: Passkey[]) => () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/account/passkeys')
      ? Response.json(list)
      : String(input).endsWith('/api/ai/status')
        ? Response.json(geminiStatus)
        : String(input).endsWith('/api/admin/ai')
          ? Response.json({
              provider: 'google',
              providerName: 'Google Gemini',
              model: 'gemini-3.8-flash',
              keySet: true,
              baseUrlHost: null,
              source: 'env',
              keyLast4: null,
              keyUnreadable: false,
              savedInactive: false,
              rev: null,
              refineLimit: 3,
              testPhotoCount: 9,
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
/**
 * 4.8 Offline: the banner; admin, passkey and password rows greyed out, a tap shows the reason (3.6).
 * No AI status seen on this device yet: no recognition row until it arrives (OCT-172).
 */
export const AdminOffline: Story = {
  beforeEach: async () => {
    localStorage.setItem(hintClosedKey(admin.id), '1');
    const db = await openUserDb(admin.id);
    await db.delete('kv', 'aiStatus');
    db.close();
    return offline();
  },
  render: () => settings(admin),
};
export const AdminOfflineDark: Story = { ...AdminOffline, ...dark };
/** Offline with the last known AI status: the recognition row shows it. */
export const AdminOfflineSaved: Story = {
  beforeEach: async () => {
    localStorage.setItem(hintClosedKey(admin.id), '1');
    const db = await openUserDb(admin.id);
    await db.put('kv', geminiStatus, 'aiStatus');
    db.close();
    return offline();
  },
  render: () => settings(admin),
};
export const AdminOfflineSavedDark: Story = { ...AdminOfflineSaved, ...dark };
/** AI provider from env with the refine limit field (ADR-0020 §6): the only field env leaves editable. */
export const AiProviderLimit: Story = {
  beforeEach: serve([]),
  render: () => <AiProviderScreen />,
};
export const AiProviderLimitDark: Story = { ...AiProviderLimit, ...dark };
/** The limit field with a value out of 1..50: the error under it. */
export const AiProviderLimitInvalid: Story = {
  ...AiProviderLimit,
  play: async ({ canvas, userEvent }) => {
    const field = await canvas.findByRole('textbox', {
      name: 'Refinements per meal per visit',
    });
    await userEvent.clear(field);
    await userEvent.type(field, '80');
    await userEvent.tab();
  },
};
export const AiProviderLimitInvalidDark: Story = {
  ...AiProviderLimitInvalid,
  ...dark,
};
/** OCT-292: the limit card on the desktop. */
export const AiProviderLimitDesktop: Story = {
  ...AiProviderLimit,
  globals: { viewport: { value: 'desktop' } },
};
export const AiProviderLimitDesktopDark: Story = {
  ...AiProviderLimit,
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};
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
const desktop = { viewport: { value: 'desktop' } };
/** A nested screen's real column (.screen), so the desktop stories show its width. */
const column = (node: ReactNode) => <div className="screen">{node}</div>;
const longPasskeys: Passkey[] = [
  ...passkeys,
  {
    id: 3,
    name: 'Work laptop in the office upstairs · Microsoft Edge',
    createdAt: Date.UTC(2026, 10, 10),
    lastUsedAt: null,
    thisDevice: false,
  },
  {
    id: 4,
    name: 'YubiKey5NFC-backup-key-from-the-drawer',
    createdAt: Date.UTC(2026, 10, 12),
    lastUsedAt: Date.UTC(2026, 10, 14),
    thisDevice: false,
  },
];
/** OCT-229: on the desktop one column the width of the screen; long names wrap by words. */
export const PasskeysDesktop: Story = {
  beforeEach: serve(longPasskeys),
  render: () => column(<PasskeysScreen user={user} onChanged={changed} />),
  globals: desktop,
};
export const PasskeysDesktopDark: Story = {
  ...PasskeysDesktop,
  globals: { ...desktop, theme: 'dark' },
};
/** Long names on the narrowest phone. */
export const PasskeysLongNames: Story = {
  beforeEach: serve(longPasskeys),
  render: () => <PasskeysScreen user={user} onChanged={changed} />,
};
export const PasskeysLongNamesDark: Story = { ...PasskeysLongNames, ...dark };
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
/** OCT-229: the fields in one column in the order they are filled. */
export const ChangePasswordDesktop: Story = {
  render: () => column(<PasswordScreen user={user} onDone={changed} />),
  globals: desktop,
};
export const ChangePasswordDesktopDark: Story = {
  ...ChangePasswordDesktop,
  globals: { ...desktop, theme: 'dark' },
};
/** 3.4 Set password: no current field. */
export const SetPassword: Story = {
  render: () => (
    <PasswordScreen user={{ ...user, methods: ['passkey'] }} onDone={changed} />
  ),
};
export const SetPasswordDark: Story = { ...SetPassword, ...dark };

/** Local offEnabled, GET /api/integrations (blocked) and GET/PUT /api/admin/integrations. */
const integrations =
  (
    on: boolean,
    blocked: boolean,
    admin = {
      outbound: !blocked,
      outboundFromEnv: false,
      tokens: true,
      tokensFromEnv: false,
    },
  ) =>
  async () => {
    const db = await openUserDb(user.id);
    await db.put(
      'kv',
      {
        locale: 'en',
        theme: 'system',
        units: 'metric',
        settingsRev: 1,
        photoRetentionDays: 30,
        normDisclaimerHidden: false,
        offEnabled: on,
        offHintAt: null,
        mcpEnabled: on,
      },
      'settings',
    );
    db.close();
    const real = globalThis.fetch;
    globalThis.fetch = async (input) =>
      String(input).endsWith('/api/integrations')
        ? Response.json({
            barcode: { enabled: on, blocked },
            // «On» also shows the card after an export.
            export: on
              ? { lastAt: '2026-11-12T12:00:00.000Z', lastFormat: 'json' }
              : { lastAt: null, lastFormat: null },
            // «On» also shows two tokens; the ban covers tokens too.
            tokens: { count: on ? 2 : 0, blocked },
            // «On» also shows a failing webhook (design 1.2).
            webhooks: {
              count: on ? 2 : 0,
              failing: on ? 'ntfy' : null,
              blocked,
            },
            mcp: { enabled: on, blocked },
          })
        : String(input).endsWith('/api/admin/integrations')
          ? Response.json(admin)
          : String(input) === '/api/tokens'
            ? Response.json(
                {
                  id: 9,
                  name: 'Claude Desktop',
                  scope: 'read',
                  createdAt: '2026-11-26T10:00:00.000Z',
                  expiresAt: null,
                  lastUsedAt: null,
                  token: 'oct_Q2xhdWRlIG1hZGUgdGhpcyB0b2tlbiBmb3IgYSBzdG9yeQ',
                },
                { status: 201 },
              )
            : new Response(null, { status: 204 });
    return () => {
      globalThis.fetch = real;
    };
  };
const withData = (node: ReactNode) => (
  <DataProvider user={user}>{node}</DataProvider>
);

/** OCT-187 §1: the hub with the barcode card, off. */
export const Integrations: Story = {
  beforeEach: integrations(false, false),
  render: () => withData(<IntegrationsScreen />),
};
export const IntegrationsDark: Story = { ...Integrations, ...dark };
export const IntegrationsOn: Story = {
  beforeEach: integrations(true, false),
  render: () => withData(<IntegrationsScreen />),
};
export const IntegrationsOnDark: Story = { ...IntegrationsOn, ...dark };
export const IntegrationsBlocked: Story = {
  beforeEach: integrations(true, true),
  render: () => withData(<IntegrationsScreen />),
};
export const IntegrationsBlockedDark: Story = {
  ...IntegrationsBlocked,
  ...dark,
};
export const IntegrationsDesktop: Story = {
  ...IntegrationsOn,
  render: () => column(withData(<IntegrationsScreen />)),
  globals: desktop,
};
export const IntegrationsDesktopDark: Story = {
  ...IntegrationsDesktop,
  globals: { ...desktop, theme: 'dark' },
};

/** OCT-313 4.1: barcode lookup off. */
export const Barcode: Story = {
  beforeEach: integrations(false, false),
  render: () => withData(<BarcodeIntegrationScreen />),
};
export const BarcodeDark: Story = { ...Barcode, ...dark };
/** 4.2: on, with «Turn off». */
export const BarcodeOn: Story = {
  beforeEach: integrations(true, false),
  render: () => withData(<BarcodeIntegrationScreen />),
};
export const BarcodeOnDark: Story = { ...BarcodeOn, ...dark };
/** 4.3: the admin's ban: lock, inactive switch. */
export const BarcodeBlocked: Story = {
  beforeEach: integrations(true, true),
  render: () => withData(<BarcodeIntegrationScreen />),
};
export const BarcodeBlockedDark: Story = { ...BarcodeBlocked, ...dark };
export const BarcodeDesktop: Story = {
  ...BarcodeOn,
  render: () => column(withData(<BarcodeIntegrationScreen />)),
  globals: desktop,
};
export const BarcodeDesktopDark: Story = {
  ...BarcodeDesktop,
  globals: { ...desktop, theme: 'dark' },
};

const PUBLIC_URL = 'https://calories.home.lan';
const mcp = () => withData(<McpScreen publicUrl={PUBLIC_URL} />);

/** OCT-187 6.1: MCP off, the warning already on screen. */
export const Mcp: Story = {
  beforeEach: integrations(false, false),
  render: mcp,
};
export const McpDark: Story = { ...Mcp, ...dark };
/** 6.2: on, no token yet: the placeholder in the snippet. */
export const McpOn: Story = {
  beforeEach: integrations(true, false),
  render: mcp,
};
export const McpOnDark: Story = { ...McpOn, ...dark };
/** 6.3: a token just created, Cursor. */
export const McpToken: Story = {
  ...McpOn,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByText('Create a token for MCP'));
    await canvas.findByText('Read-only · just created');
    await userEvent.click(canvas.getByRole('radio', { name: 'Cursor' }));
  },
};
export const McpTokenDark: Story = { ...McpToken, ...dark };
/** The admin turned tokens off: lock, inactive switch, no address. */
export const McpBlocked: Story = {
  beforeEach: integrations(true, true),
  render: mcp,
};
export const McpBlockedDark: Story = { ...McpBlocked, ...dark };
export const McpDesktop: Story = {
  ...McpToken,
  render: () => column(mcp()),
  globals: desktop,
};
export const McpDesktopDark: Story = {
  ...McpDesktop,
  globals: { ...desktop, theme: 'dark' },
};

/** OCT-187 7.1: outbound requests allowed. */
export const ServerIntegrations: Story = {
  beforeEach: integrations(false, false),
  render: () => <AdminIntegrationsScreen />,
};
export const ServerIntegrationsDark: Story = { ...ServerIntegrations, ...dark };
/** 7.2: blocking asks first. */
export const ServerIntegrationsBlock: Story = {
  ...ServerIntegrations,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('switch', {
        name: 'Outgoing requests from the server',
      }),
    );
  },
};
export const ServerIntegrationsBlockDark: Story = {
  ...ServerIntegrationsBlock,
  ...dark,
};
/** 7.3: set in .env, both switches read-only. */
export const ServerIntegrationsEnv: Story = {
  beforeEach: integrations(false, true, {
    outbound: false,
    outboundFromEnv: true,
    tokens: true,
    tokensFromEnv: true,
  }),
  render: () => <AdminIntegrationsScreen />,
};
export const ServerIntegrationsEnvDark: Story = {
  ...ServerIntegrationsEnv,
  ...dark,
};
export const ServerIntegrationsDesktop: Story = {
  ...ServerIntegrations,
  render: () => column(<AdminIntegrationsScreen />),
  globals: desktop,
};
export const ServerIntegrationsDesktopDark: Story = {
  ...ServerIntegrationsDesktop,
  globals: { ...desktop, theme: 'dark' },
};
