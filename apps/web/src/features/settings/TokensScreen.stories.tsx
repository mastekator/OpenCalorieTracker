import type { Meta, StoryObj } from '@storybook/react-vite';
import { within } from 'storybook/test';
import type { ApiToken, MeResponse } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { atPath } from '../../ui/navStory';
import { ToastProvider } from '../../ui/Toast/Toast';
import { TokensScreen } from './TokensScreen';

const user = { id: 1, role: 'user', locale: 'en' } as MeResponse;
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const token = (
  id: number,
  name: string,
  more: Partial<ApiToken> = {},
): ApiToken => ({
  id,
  name,
  scope: 'read',
  createdAt: at(-40),
  expiresAt: at(50),
  lastUsedAt: at(-1),
  ...more,
});
const LIST = [
  token(1, 'Home Assistant'),
  token(2, 'Shortcut on the phone', {
    scope: 'write',
    expiresAt: at(3),
    lastUsedAt: null,
  }),
  token(3, 'Old script', { expiresAt: at(-5) }),
  token(4, 'AI assistant', { expiresAt: null }),
];

/** GET /api/tokens answers `list`; POST makes a token; the ban comes from /api/integrations. */
const serve =
  (list: ApiToken[], { blocked = false, offline = false } = {}) =>
  () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations'))
        return Response.json({
          barcode: { enabled: false, blocked: false },
          export: { lastAt: null, lastFormat: null },
          tokens: { count: list.length, blocked },
        });
      if (url.startsWith('/api/tokens'))
        return init?.method === 'POST'
          ? Response.json(
              {
                ...token(9, 'Home Assistant', { lastUsedAt: null }),
                token: 'oct_Q2xhdWRlIG1hZGUgdGhpcyB0b2tlbiBmb3IgYSBzdG9yeQ',
              },
              { status: 201 },
            )
          : Response.json(list);
      return new Response(null, { status: 204 });
    };
    if (offline)
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => false,
      });
    return () => {
      globalThis.fetch = real;
      if (offline) delete (navigator as { onLine?: boolean }).onLine;
    };
  };

/** Access tokens, OCT-187 4.1–4.5. Theme and language: toolbar. */
const meta = {
  title: 'Settings/Tokens',
  decorators: [
    atPath,
    (Story) => (
      <ToastProvider>
        <DataProvider user={user}>
          <div className="screen__body">
            <Story />
          </div>
        </DataProvider>
      </ToastProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  render: () => <TokensScreen />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** 4.1: no tokens yet. */
export const Empty: Story = { beforeEach: serve([]) };
export const EmptyDark: Story = { ...Empty, ...dark };

/** 4.4: read and write, expiring soon (warning), expired («Delete»), no expiry. */
export const List: Story = { beforeEach: serve(LIST) };
export const ListDark: Story = { ...List, ...dark };

/** 4.2: the form, 90 days by default. */
export const Create: Story = {
  beforeEach: serve(LIST),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Create token' }),
    );
  },
};
export const CreateDark: Story = { ...Create, ...dark };

/** 4.3: the token, once. */
export const Created: Story = {
  beforeEach: serve(LIST),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Create token' }),
    );
    // The sheet is a modal <dialog> outside the canvas.
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(await page.findByLabelText('Name'), 'Home Assistant');
    await userEvent.click(
      within(page.getByRole('dialog')).getByRole('button', {
        name: 'Create token',
      }),
    );
  },
};
export const CreatedDark: Story = { ...Created, ...dark };

/** 4.5: 20 of 20, creating is off. */
export const Limit: Story = {
  beforeEach: serve(
    Array.from({ length: 20 }, (_, i) => token(i + 1, `Script ${i + 1}`)),
  ),
};
export const LimitDark: Story = { ...Limit, ...dark };

/** The admin turned tokens off: a lock, no creating, revoking still works. */
export const Blocked: Story = { beforeEach: serve(LIST, { blocked: true }) };
export const BlockedDark: Story = { ...Blocked, ...dark };

/** Offline: the last list stays, actions need a network. */
export const Offline: Story = { beforeEach: serve(LIST, { offline: true }) };
export const OfflineDark: Story = { ...Offline, ...dark };
