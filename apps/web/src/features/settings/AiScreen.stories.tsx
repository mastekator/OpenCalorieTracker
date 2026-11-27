import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AiConsentsResponse, MeResponse, OwnAi } from '@oct/shared';
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

const SAVED: OwnAi = {
  provider: 'openai',
  model: 'gpt-5-mini',
  baseUrl: null,
  keyLast4: 'k7Qz',
  keyUnreadable: false,
  state: 'ok',
  checkedAt: Date.now() - 5 * 60_000,
};
const STATUS = {
  recognition: 'ready',
  interview: 'ready',
  providerName: 'Google Gemini',
  baseUrlHost: null,
  refineLimit: null,
};

/**
 * GET /api/ai/consents answers CONSENTS, DELETE succeeds; the device switch starts as `deviceAi`.
 * `own`: the saved own key; `keysOff`: own keys are forbidden, `notice` the admin just did it.
 */
const serve =
  ({
    deviceAi = true,
    offline = false,
    own = null as OwnAi,
    keysOff = false,
    notice = false,
  } = {}) =>
  () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === '/api/ai/status')
        return Response.json({ ...STATUS, userKeysDisabledNotice: notice });
      if (url.startsWith('/api/ai/own'))
        return keysOff
          ? Response.json(
              { error: { code: 'ai_user_keys_disabled', message: '' } },
              { status: 403 },
            )
          : url.endsWith('/models')
            ? Response.json({ models: [] })
            : Response.json(init?.method === 'DELETE' ? null : own);
      return init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json(CONSENTS);
    };
    localStorage.setItem(`oct.aiConsents.${user.id}`, JSON.stringify(CONSENTS));
    localStorage.setItem(`oct.ownAi.${user.id}`, JSON.stringify(own));
    setDeviceAi(user.id, deviceAi);
    if (offline)
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: () => false,
      });
    return () => {
      globalThis.fetch = real;
      setDeviceAi(user.id, true);
      localStorage.removeItem(`oct.ownAi.${user.id}`);
      if (offline) delete (navigator as { onLine?: boolean }).onLine;
    };
  };

/** Settings → AI, OCT-178 1.1–1.3, 1.10–1.12, 1.14, 5.1. Theme and language: toolbar. */
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

/** 1.2: «My own API key» picked, no key yet: the form with Save only. */
export const OwnKeyNew: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('radio', {
        name: /My own API key|Свой API-ключ/,
      }),
    );
  },
};
export const OwnKeyNewDark: Story = { ...OwnKeyNew, ...dark };

/** 1.3: the key is saved and working: «…k7Qz», «Check now», where it is stored, «Delete key». */
export const OwnKeySaved: Story = { beforeEach: serve({ own: SAVED }) };
export const OwnKeySavedDark: Story = { ...OwnKeySaved, ...dark };

/** 1.10: the delete confirm. */
export const OwnKeyDelete: Story = {
  beforeEach: serve({ own: SAVED }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: /Delete key|Удалить ключ/ }),
    );
  },
};
export const OwnKeyDeleteDark: Story = { ...OwnKeyDelete, ...dark };

/** 1.12: the admin turned own keys off: the notice once, no «My own API key». */
export const KeysOff: Story = {
  beforeEach: serve({ keysOff: true, notice: true }),
};
export const KeysOffDark: Story = { ...KeysOff, ...dark };

/** 1.14: offline with a saved key: the copy shows, actions answer with a toast. */
export const OwnKeyOffline: Story = {
  beforeEach: serve({ own: SAVED, offline: true }),
};
export const OwnKeyOfflineDark: Story = { ...OwnKeyOffline, ...dark };
