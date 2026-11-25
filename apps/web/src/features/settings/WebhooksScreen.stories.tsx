import type { Meta, StoryObj } from '@storybook/react-vite';
import { within } from 'storybook/test';
import { tr } from '../../../.storybook/tr';
import type { MeResponse, Webhook } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { atPath } from '../../ui/navStory';
import { ToastProvider } from '../../ui/Toast/Toast';
import { WebhooksScreen } from './WebhooksScreen';

const user = { id: 1, role: 'user', locale: 'en' } as MeResponse;
const hook = (
  id: number,
  name: string,
  url: string,
  more: Partial<Webhook> = {},
): Webhook => ({
  id,
  name,
  url,
  events: ['meal.saved', 'day.closed'],
  dayClosedAt: '23:59',
  emptyBy: null,
  enabled: true,
  disabledReason: null,
  failStreak: 0,
  createdAt: '2026-11-01T10:00:00.000Z',
  ...more,
});
const LIST = [
  hook(1, 'Home Assistant', 'https://ha.home.lan/api/webhook/oct-meals'),
  hook(2, 'ntfy', 'https://ntfy.sh/oct-ksenia', { failStreak: 3 }),
  hook(3, 'n8n', 'http://192.168.1.20:5678/webhook/oct', {
    enabled: false,
    disabledReason: 'failures',
    failStreak: 20,
  }),
];

/** GET /api/webhooks answers `list`; POST makes a webhook; the ban comes from /api/integrations. */
const serve =
  (list: Webhook[], { blocked = false, error = '' } = {}) =>
  () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/integrations'))
        return Response.json({
          barcode: { enabled: false, blocked },
          export: { lastAt: null, lastFormat: null },
          tokens: { count: 0, blocked: false },
          webhooks: {
            count: list.length,
            enabled: list.filter((w) => w.enabled).length,
            failing: null,
            blocked,
          },
          mcp: { enabled: false, blocked: false },
        });
      if (url.startsWith('/api/webhooks')) {
        if ((init?.method ?? 'GET') === 'GET') return Response.json(list);
        if (error)
          return Response.json({ error: { code: error } }, { status: 400 });
        return Response.json(
          {
            ...hook(
              9,
              'Home Assistant',
              'https://ha.home.lan/api/webhook/oct-meals',
            ),
            secret: 'whsec_Q2xhdWRlIG1hZGUgdGhpcyBzZWNyZXQgZm9yIGEgc3Rvcnk',
          },
          { status: 201 },
        );
      }
      return new Response(null, { status: 204 });
    };
    return () => {
      globalThis.fetch = real;
    };
  };

/** Webhooks, OCT-187 5.1–5.4, 5.6–5.7. Theme and language: toolbar; desktop: viewport. */
const meta = {
  title: 'Settings/Webhooks',
  decorators: [
    atPath,
    (Story) => (
      <ToastProvider>
        <DataProvider user={user}>
          <div className="screen__body">
            {/* The app's column, so the desktop stories show its width. */}
            <div className="screen">
              <Story />
            </div>
          </div>
        </DataProvider>
      </ToastProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  render: () => <WebhooksScreen />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };
const desktop = { globals: { viewport: { value: 'desktop' } } };

/** 5.1: no webhooks yet. */
export const Empty: Story = { beforeEach: serve([]) };
export const EmptyDark: Story = { ...Empty, ...dark };

/** 5.1, 5.7: on, failing, off after 20 failures with «Turn on». */
export const List: Story = { beforeEach: serve(LIST) };
export const ListDark: Story = { ...List, ...dark };
export const ListDesktop: Story = { ...List, ...desktop };
export const ListDesktopDark: Story = {
  ...List,
  globals: { viewport: { value: 'desktop' }, theme: 'dark' },
};

const openNew: Story['play'] = async ({
  canvas,
  canvasElement,
  globals,
  userEvent,
}) => {
  await userEvent.click(
    await canvas.findByRole('button', {
      name: tr(globals, 'integr.webhooks.add'),
    }),
  );
  // The sheet is a modal <dialog> outside the canvas.
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.type(
    await page.findByLabelText(tr(globals, 'integr.tokens.name')),
    'Home Assistant',
  );
};

/** 5.2: the form, «Meal saved» on by default. */
export const Add: Story = {
  beforeEach: serve(LIST.slice(0, 1)),
  play: openNew,
};
export const AddDark: Story = { ...Add, ...dark };

/** 5.3: http to an address on the internet. */
export const HttpError: Story = {
  beforeEach: serve([], { error: 'http_not_private' }),
  play: async (ctx) => {
    await openNew(ctx);
    const page = within(ctx.canvasElement.ownerDocument.body);
    await ctx.userEvent.type(
      page.getByLabelText(tr(ctx.globals, 'integr.webhooks.url')),
      'http://example.com/hook',
    );
    await ctx.userEvent.click(
      within(page.getByRole('dialog')).getByRole('button', {
        name: tr(ctx.globals, 'integr.webhooks.add'),
      }),
    );
  },
};
export const HttpErrorDark: Story = { ...HttpError, ...dark };

/** 5.4: the signing secret, once. */
export const Created: Story = {
  beforeEach: serve([]),
  play: async (ctx) => {
    await openNew(ctx);
    const page = within(ctx.canvasElement.ownerDocument.body);
    await ctx.userEvent.type(
      page.getByLabelText(tr(ctx.globals, 'integr.webhooks.url')),
      'https://ha.home.lan/api/webhook/oct-meals',
    );
    await ctx.userEvent.click(
      within(page.getByRole('dialog')).getByRole('button', {
        name: tr(ctx.globals, 'integr.webhooks.add'),
      }),
    );
  },
};
export const CreatedDark: Story = { ...Created, ...dark };

/** The admin forbade outgoing requests: a lock, no adding, no turning on. */
export const Blocked: Story = { beforeEach: serve(LIST, { blocked: true }) };
export const BlockedDark: Story = { ...Blocked, ...dark };
