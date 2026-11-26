import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AiConsentsResponse, MeResponse } from '@oct/shared';
import { setDeviceAi } from '../../data/deviceAi';
import { ToastProvider } from '../../ui/Toast/Toast';
import { AiScreen } from './AiScreen';

const user = { id: 1, role: 'user', locale: 'en' } as MeResponse;
const DAY = 86_400_000;
const CONSENTS: AiConsentsResponse = {
  consents: [
    { providerKey: 'google', grantedAt: Date.now() - 20 * DAY },
    { providerKey: 'openai', grantedAt: Date.now() - 2 * DAY },
  ],
  server: {
    providerKey: 'google',
    provider: 'google',
    host: null,
    local: false,
  },
};

/** GET /api/ai/consents answers CONSENTS, DELETE succeeds; the device switch starts as `deviceAi`. */
const serve =
  ({ deviceAi = true, offline = false } = {}) =>
  () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (_input, init) =>
      init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json(CONSENTS);
    localStorage.setItem(`oct.aiConsents.${user.id}`, JSON.stringify(CONSENTS));
    setDeviceAi(user.id, deviceAi);
    if (offline)
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => false,
      });
    return () => {
      globalThis.fetch = real;
      setDeviceAi(user.id, true);
      if (offline) delete (navigator as { onLine?: boolean }).onLine;
    };
  };

/** Settings → AI, OCT-178 1.1, 1.11, 1.14, 5.1. Theme and language: toolbar. */
const meta = {
  title: 'Settings/AI',
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="screen__body">
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
  parameters: { layout: 'fullscreen' },
  render: () => <AiScreen user={user} />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const dark = { globals: { theme: 'dark' } };

/** 1.1: AI on, consents through the server. */
export const Default: Story = { beforeEach: serve() };
export const DefaultDark: Story = { ...Default, ...dark };

/** 1.11: AI off on this device; the rest stays as is. */
export const DeviceOff: Story = { beforeEach: serve({ deviceAi: false }) };
export const DeviceOffDark: Story = { ...DeviceOff, ...dark };

/** 1.14: offline, the copy on this device; «Revoke» answers with a toast. */
export const Offline: Story = { beforeEach: serve({ offline: true }) };
export const OfflineDark: Story = { ...Offline, ...dark };

/** 1.9: the revoke confirm. */
export const Revoke: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    const [first] = await canvas.findAllByRole('button', {
      name: /^(Revoke|Отозвать) /,
    });
    await userEvent.click(first!);
  },
};
export const RevokeDark: Story = { ...Revoke, ...dark };
