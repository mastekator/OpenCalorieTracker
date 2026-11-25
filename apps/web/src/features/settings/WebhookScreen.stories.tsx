import type { Meta, StoryObj } from '@storybook/react-vite';
import { within } from 'storybook/test';
import type { MeResponse, Webhook, WebhookDelivery } from '@oct/shared';
import { DataProvider } from '../../data/DataContext';
import { atPath } from '../../ui/navStory';
import { ToastProvider } from '../../ui/Toast/Toast';
import { WebhookScreen } from './WebhookScreen';

const user = { id: 1, role: 'user', locale: 'en' } as MeResponse;
const NTFY: Webhook = {
  id: 2,
  name: 'ntfy',
  url: 'https://ntfy.sh/oct-ksenia',
  events: ['meal.saved', 'day.empty'],
  dayClosedAt: '23:59',
  emptyBy: '20:00',
  enabled: true,
  disabledReason: null,
  failStreak: 3,
  createdAt: '2026-11-01T10:00:00.000Z',
};
const row = (
  id: number,
  at: string,
  more: Partial<WebhookDelivery>,
): WebhookDelivery => ({
  id,
  event: 'meal.saved',
  at,
  status: 200,
  error: null,
  attempts: 1,
  durationMs: 180,
  ...more,
});
const LOG = [
  row(5, '2026-11-20T21:40:00.000Z', {}),
  row(4, '2026-11-20T19:05:00.000Z', { event: 'test' }),
  row(3, '2026-11-20T13:12:00.000Z', { status: 503, attempts: 3 }),
  row(2, '2026-11-19T23:59:00.000Z', {
    event: 'day.closed',
    status: null,
    error: 'timeout',
    durationMs: null,
  }),
  row(1, '2026-11-19T12:30:00.000Z', { status: 204 }),
];

/** The webhook with its log; «Send test» answers `test`; the ban comes from /api/integrations. */
const serve =
  (
    hook: Webhook,
    log: WebhookDelivery[],
    { blocked = false, test = LOG[1]! } = {},
  ) =>
  () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/api/integrations'))
        return Response.json({
          barcode: { enabled: false, blocked },
          export: { lastAt: null, lastFormat: null },
          tokens: { count: 0, blocked: false },
          webhooks: { count: 1, failing: null, blocked },
          mcp: { enabled: false, blocked: false },
        });
      if (url.endsWith('/deliveries')) return Response.json(log);
      if (url.endsWith('/test')) return Response.json({ ...test, id: 99 });
      if (url.endsWith('/secret'))
        return Response.json({
          ...hook,
          secret: 'whsec_Q2xhdWRlIG1hZGUgdGhpcyBzZWNyZXQgZm9yIGEgc3Rvcnk',
        });
      if (url.startsWith('/api/webhooks')) return Response.json([hook]);
      return new Response(null, { status: 204 });
    };
    return () => {
      globalThis.fetch = real;
    };
  };

/** One webhook, OCT-187 5.5. Theme and language: toolbar; desktop: viewport. */
const meta = {
  title: 'Settings/Webhook',
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
  render: () => <WebhookScreen id="2" />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** Failing in a row, the log with retries and no reply. */
export const Default: Story = { beforeEach: serve(NTFY, LOG) };
export const DefaultDark: Story = { ...Default, ...dark };
export const Desktop: Story = {
  ...Default,
  globals: { viewport: { value: 'desktop' } },
};

/** No deliveries yet. */
export const EmptyLog: Story = {
  beforeEach: serve({ ...NTFY, failStreak: 0 }, []),
};
export const EmptyLogDark: Story = { ...EmptyLog, ...dark };

const sendTest: Story['play'] = async ({ canvas, userEvent }) => {
  await userEvent.click(
    await canvas.findByRole('button', { name: 'Send test' }),
  );
};

/** «Send test» delivered. */
export const TestOk: Story = { ...Default, play: sendTest };
export const TestOkDark: Story = { ...TestOk, ...dark };

/** «Send test» got no reply in 10 s. */
export const TestFailed: Story = {
  beforeEach: serve(NTFY, LOG, { test: LOG[3]! }),
  play: sendTest,
};
export const TestFailedDark: Story = { ...TestFailed, ...dark };

/** Off after 20 failures: «Turn on» instead of «Edit». */
export const AutoOff: Story = {
  beforeEach: serve(
    { ...NTFY, enabled: false, disabledReason: 'failures', failStreak: 20 },
    LOG,
  ),
};
export const AutoOffDark: Story = { ...AutoOff, ...dark };

/** «Rotate» → confirm → the new secret, once. */
export const Rotated: Story = {
  ...Default,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Rotate the secret' }),
    );
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(await page.findByRole('alertdialog')).getByRole('button', {
        name: 'Rotate',
      }),
    );
  },
};
export const RotatedDark: Story = { ...Rotated, ...dark };

/** «Delete webhook» asks first. */
export const Delete: Story = {
  ...Default,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByText('Delete webhook'));
  },
};
export const DeleteDark: Story = { ...Delete, ...dark };

/** The admin forbade outgoing requests: no test, the lock. */
export const Blocked: Story = {
  beforeEach: serve(NTFY, LOG, { blocked: true }),
};
export const BlockedDark: Story = { ...Blocked, ...dark };
